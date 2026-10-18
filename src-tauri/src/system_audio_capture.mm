#import <Foundation/Foundation.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <CoreMedia/CoreMedia.h>
#import <AudioToolbox/AudioToolbox.h>

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

extern "C" void ghostove_on_system_audio(const float *samples, uintptr_t count, uint32_t sample_rate);

@interface GhostoveSystemAudioOutput : NSObject <SCStreamOutput>
@end

@implementation GhostoveSystemAudioOutput
- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(SCStreamOutputType)type API_AVAILABLE(macos(13.0)) {
    (void)stream;
    if (type != SCStreamOutputTypeAudio || !CMSampleBufferIsValid(sampleBuffer)) return;

    CMAudioFormatDescriptionRef format = (CMAudioFormatDescriptionRef)CMSampleBufferGetFormatDescription(sampleBuffer);
    const AudioStreamBasicDescription *description = format ? CMAudioFormatDescriptionGetStreamBasicDescription(format) : NULL;
    if (!description || description->mChannelsPerFrame == 0 || description->mBitsPerChannel == 0) return;

    size_t bufferListSize = 0;
    CMBlockBufferRef retainedBlockBuffer = NULL;
    OSStatus status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
        sampleBuffer, &bufferListSize, NULL, 0, NULL, NULL,
        kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
        NULL);
    if (status != noErr || bufferListSize < sizeof(AudioBufferList)) {
        return;
    }

    AudioBufferList *buffers = (AudioBufferList *)malloc(bufferListSize);
    if (!buffers) {
        if (retainedBlockBuffer) CFRelease(retainedBlockBuffer);
        return;
    }

    status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
        sampleBuffer, &bufferListSize, buffers, bufferListSize, NULL, NULL,
        kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
        &retainedBlockBuffer);
    if (status != noErr) {
        free(buffers);
        if (retainedBlockBuffer) CFRelease(retainedBlockBuffer);
        return;
    }

    const size_t frameCount = CMSampleBufferGetNumSamples(sampleBuffer);
    const size_t channelCount = description->mChannelsPerFrame;
    const size_t bytesPerSample = description->mBitsPerChannel / 8;
    const bool isFloat = (description->mFormatFlags & kAudioFormatFlagIsFloat) != 0;
    const bool isSignedInteger = (description->mFormatFlags & kAudioFormatFlagIsSignedInteger) != 0;
    const bool nonInterleaved = (description->mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0;
    const bool supported = (isFloat && bytesPerSample == sizeof(float)) ||
        (isSignedInteger && (bytesPerSample == sizeof(int16_t) || bytesPerSample == sizeof(int32_t)));

    if (!supported) {
        free(buffers);
        if (retainedBlockBuffer) CFRelease(retainedBlockBuffer);
        return;
    }

    float *mono = (float *)malloc(frameCount * sizeof(float));
    if (!mono) {
        free(buffers);
        if (retainedBlockBuffer) CFRelease(retainedBlockBuffer);
        return;
    }

    for (size_t frame = 0; frame < frameCount; frame++) {
        float sum = 0.0f;
        size_t channelsRead = 0;
        for (size_t channel = 0; channel < channelCount; channel++) {
            if (buffers->mNumberBuffers == 0 || (nonInterleaved && channel >= buffers->mNumberBuffers)) continue;
            AudioBuffer *buffer = nonInterleaved ? &buffers->mBuffers[channel] : &buffers->mBuffers[0];
            if (!buffer->mData) continue;
            const size_t sampleIndex = nonInterleaved ? frame : frame * channelCount + channel;
            if ((sampleIndex + 1) * bytesPerSample > buffer->mDataByteSize) continue;
            const uint8_t *bytes = (const uint8_t *)buffer->mData + sampleIndex * bytesPerSample;
            float value = 0.0f;
            if (isFloat) {
                memcpy(&value, bytes, sizeof(float));
            } else if (bytesPerSample == sizeof(int16_t)) {
                int16_t sample = 0;
                memcpy(&sample, bytes, sizeof(sample));
                value = (float)sample / 32768.0f;
            } else {
                int32_t sample = 0;
                memcpy(&sample, bytes, sizeof(sample));
                value = (float)((double)sample / 2147483648.0);
            }
            sum += value;
            channelsRead++;
        }
        mono[frame] = channelsRead ? sum / (float)channelsRead : 0.0f;
    }

    ghostove_on_system_audio(mono, frameCount, (uint32_t)description->mSampleRate);
    free(mono);
    free(buffers);
    if (retainedBlockBuffer) CFRelease(retainedBlockBuffer);
}
@end

static NSLock *captureLock;
static SCStream *systemAudioStream API_AVAILABLE(macos(13.0));
static GhostoveSystemAudioOutput *systemAudioOutput;

static void copyError(NSError *error, char *outError, size_t capacity) {
    if (!outError || capacity == 0) return;
    const char *message = error.localizedDescription.UTF8String ?: "System audio capture failed.";
    strlcpy(outError, message, capacity);
}

extern "C" int ghostove_system_audio_start(char *outError, size_t errorCapacity) {
    if (@available(macOS 13.0, *)) {
        static dispatch_once_t onceToken;
        dispatch_once(&onceToken, ^{ captureLock = [[NSLock alloc] init]; });

        [captureLock lock];
        if (systemAudioStream) {
            [captureLock unlock];
            return 1;
        }
        [captureLock unlock];

        dispatch_semaphore_t contentSemaphore = dispatch_semaphore_create(0);
        __block SCShareableContent *shareableContent = nil;
        __block NSError *contentError = nil;
        [SCShareableContent getShareableContentExcludingDesktopWindows:YES
                                                   onScreenWindowsOnly:YES
                                                     completionHandler:^(SCShareableContent *content, NSError *error) {
            shareableContent = content;
            contentError = error;
            dispatch_semaphore_signal(contentSemaphore);
        }];

        if (dispatch_semaphore_wait(contentSemaphore, dispatch_time(DISPATCH_TIME_NOW, 15 * NSEC_PER_SEC)) != 0) {
            if (outError && errorCapacity) strlcpy(outError, "Timed out while requesting macOS screen/audio access.", errorCapacity);
            return 0;
        }
        if (contentError || shareableContent.displays.count == 0) {
            copyError(contentError, outError, errorCapacity);
            if (!contentError && outError && errorCapacity) strlcpy(outError, "No display is available for system audio capture.", errorCapacity);
            return 0;
        }

        SCDisplay *display = shareableContent.displays.firstObject;
        SCContentFilter *filter = [[SCContentFilter alloc] initWithDisplay:display excludingWindows:@[]];
        SCStreamConfiguration *configuration = [[SCStreamConfiguration alloc] init];
        configuration.capturesAudio = YES;
        configuration.sampleRate = 48000;
        configuration.channelCount = 1;
        configuration.excludesCurrentProcessAudio = YES;
        configuration.width = 2;
        configuration.height = 2;

        GhostoveSystemAudioOutput *output = [[GhostoveSystemAudioOutput alloc] init];
        SCStream *stream = [[SCStream alloc] initWithFilter:filter configuration:configuration delegate:nil];
        NSError *addOutputError = nil;
        if (![stream addStreamOutput:output type:SCStreamOutputTypeAudio sampleHandlerQueue:dispatch_get_global_queue(QOS_CLASS_USER_INTERACTIVE, 0) error:&addOutputError]) {
            copyError(addOutputError, outError, errorCapacity);
            return 0;
        }

        dispatch_semaphore_t startSemaphore = dispatch_semaphore_create(0);
        __block NSError *startError = nil;
        [stream startCaptureWithCompletionHandler:^(NSError *error) {
            startError = error;
            dispatch_semaphore_signal(startSemaphore);
        }];
        if (dispatch_semaphore_wait(startSemaphore, dispatch_time(DISPATCH_TIME_NOW, 15 * NSEC_PER_SEC)) != 0) {
            if (outError && errorCapacity) strlcpy(outError, "Timed out while starting system audio capture.", errorCapacity);
            return 0;
        }
        if (startError) {
            copyError(startError, outError, errorCapacity);
            return 0;
        }

        [captureLock lock];
        systemAudioOutput = output;
        systemAudioStream = stream;
        [captureLock unlock];
        return 1;
    }

    if (outError && errorCapacity) strlcpy(outError, "Native system audio capture requires macOS 13 or later.", errorCapacity);
    return 0;
}

extern "C" void ghostove_system_audio_stop(void) {
    if (@available(macOS 13.0, *)) {
        [captureLock lock];
        SCStream *stream = systemAudioStream;
        systemAudioStream = nil;
        systemAudioOutput = nil;
        [captureLock unlock];
        if (!stream) return;

        dispatch_semaphore_t stopSemaphore = dispatch_semaphore_create(0);
        [stream stopCaptureWithCompletionHandler:^(NSError *error) {
            (void)error;
            dispatch_semaphore_signal(stopSemaphore);
        }];
        dispatch_semaphore_wait(stopSemaphore, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));
    }
}

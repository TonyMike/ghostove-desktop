const AUDIO_ONBOARDING_KEY = 'ghostove_audio_onboarding_completed';

export function isAudioOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(AUDIO_ONBOARDING_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markAudioOnboardingComplete(): void {
  try {
    localStorage.setItem(AUDIO_ONBOARDING_KEY, 'true');
  } catch (error) {
    console.warn('[Onboarding] Could not save audio setup completion:', error);
  }
}

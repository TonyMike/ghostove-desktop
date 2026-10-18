fn main() {
    tauri_build::build();

    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("src/system_audio_capture.mm")
            .cpp(true)
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .flag("-fmodules")
            .flag("-mmacosx-version-min=10.15")
            .compile("ghostove_system_audio_capture");

        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=CoreMedia");
        println!("cargo:rustc-link-lib=framework=CoreAudio");
        println!("cargo:rustc-link-arg=-Wl,-weak_framework,ScreenCaptureKit");
        println!("cargo:rerun-if-changed=src/system_audio_capture.mm");
    }
}

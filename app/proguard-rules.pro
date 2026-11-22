# DocuQuick ProGuard & R8 Optimization Rules
# Keeps the compiled APK under 4 MB while removing all unused bytecode

-keepattributes *Annotation*,JavascriptInterface
-dontwarn java.lang.invoke.**
-dontwarn androidx.webkit.**

# Keep JavaScript bridge methods accessible from WebView
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep data models and bridge
-keep class com.docuquick.app.model.** { *; }
-keep class com.docuquick.app.ViewerActivity$PresentationBridge { *; }

# Keep Material Components
-keep class com.google.android.material.** { *; }
-dontwarn com.google.android.material.**

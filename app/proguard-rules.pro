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

# Material Components: Allow R8 to tree-shake unused widgets while preserving used components
-dontwarn com.google.android.material.**
-keepclassmembers class * extends android.view.View {
    public <init>(android.content.Context);
    public <init>(android.content.Context, android.util.AttributeSet);
    public <init>(android.content.Context, android.util.AttributeSet, int);
}

# Aggressive inlining and class repackaging for maximum bytecode compression
-allowaccessmodification
-repackageclasses ""

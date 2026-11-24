# DocuQuick ProGuard & R8 Optimization Rules
# Keeps the compiled APK under 4 MB while removing all unused bytecode

-keepattributes *Annotation*,JavascriptInterface
-dontwarn java.lang.invoke.**
-dontwarn androidx.webkit.**

# Keep JavaScript bridge methods accessible from WebView
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep data models, enum constants, and serialization
-keep class com.docuquick.app.model.** { *; }
-keepclassmembers enum com.docuquick.app.model.** {
    public static **[] values();
    public static ** valueOf(java.lang.String);
    public *;
}
-keep class com.docuquick.app.ViewerActivity$PresentationBridge { *; }

# Keep RecyclerView UI Adapters and ViewHolders
-keep class com.docuquick.app.ui.RecentFilesAdapter* { *; }
-keep class * extends androidx.recyclerview.widget.RecyclerView$ViewHolder { *; }

# Keep Material Components and Scrolling Behaviors (invoked via XML reflection)
-dontwarn com.google.android.material.**
-keep class com.google.android.material.appbar.AppBarLayout$ScrollingViewBehavior { *; }
-keep class com.google.android.material.appbar.HeaderScrollingViewBehavior { *; }
-keepclassmembers class * extends android.view.View {
    public <init>(android.content.Context);
    public <init>(android.content.Context, android.util.AttributeSet);
    public <init>(android.content.Context, android.util.AttributeSet, int);
}

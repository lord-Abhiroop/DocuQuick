# DocuQuick ProGuard & R8 Optimization Rules
# Keeps the compiled APK under 2-3 MB while removing all unused bytecode

-keepattributes *Annotation*
-dontwarn java.lang.invoke.**

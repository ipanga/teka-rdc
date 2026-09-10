# MS7 — R8 keep rules.
#
# Flutter's own engine classes are kept by the AGP/Flutter default rules that
# ship with the Gradle plugin, so this file only covers what R8 cannot see
# through reflection or JNI in the plugins this app actually uses.

# --- Flutter engine + embedding (reflected from native) ---
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-keep class io.flutter.plugin.** { *; }
-dontwarn io.flutter.embedding.**

# --- Firebase / FCM: model classes are instantiated reflectively ---
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# --- Keep annotations and generic signatures R8 would otherwise strip;
#     several plugins read them at runtime. ---
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# --- Crash reports must stay readable: keep line numbers and map the file
#     name so a deobfuscated stack trace still points at a real line. ---
-keepattributes SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile

# --- androidx.security (flutter_secure_storage's encryptedSharedPreferences) ---
-keep class androidx.security.crypto.** { *; }
-dontwarn androidx.security.crypto.**

# --- Play Core is referenced by Flutter's deferred-components code path,
#     which this app does not use; without this R8 fails on the missing refs. ---
-dontwarn com.google.android.play.core.**

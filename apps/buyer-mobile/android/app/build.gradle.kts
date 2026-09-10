import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // Generates Firebase resources from app/google-services.json at build
    // time. The version is pinned in android/settings.gradle.kts.
    id("com.google.gms.google-services")
}

// Release signing (Play Store). CI writes `android/key.properties` + the
// upload keystore from GitHub secrets (see scripts/sync-android-signing.sh /
// .github/workflows/release-mobile-aab.yml); both are gitignored. When
// key.properties is absent (local dev, internal APK builds) the release build
// falls back to debug signing so `flutter run --release` still works.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "com.tootiye.teka"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Required by flutter_local_notifications ≥ 14 — backports
        // newer java.time / java.util APIs so they work on older
        // Android API levels.
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.tootiye.teka"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Flavors. `production` keeps the existing applicationId
    // (com.tootiye.teka — already in Play Store). `development` and
    // `staging` get suffixed ids so all three variants can install
    // side-by-side on the same device. The launcher label remains the
    // public app name for every variant. app_name is generated as an
    // Android string resource via resValue and consumed by the
    // <application android:label="@string/app_name"> in
    // AndroidManifest.xml.
    //
    // Firebase: google-services.json must contain client entries for
    // all three package names (com.tootiye.teka, .dev, .staging). Add
    // missing apps in Firebase Console → "Add app" → Android, then
    // re-download the merged google-services.json. The plugin reads
    // it once at build time and matches on applicationId.
    flavorDimensions += "env"
    productFlavors {
        create("development") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            resValue("string", "app_name", "Teka")
            // App Links host (manifest ${appLinkHost}). dev/staging point at
            // non-prod hosts so they never claim teka.cd links on a device that
            // also has the prod app; only prod's host serves assetlinks.json.
            manifestPlaceholders["appLinkHost"] = "dev.teka.cd"
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            resValue("string", "app_name", "Teka")
            manifestPlaceholders["appLinkHost"] = "staging.teka.cd"
        }
        create("production") {
            dimension = "env"
            // No applicationIdSuffix — production keeps com.tootiye.teka
            // to match the existing Play Store listing.
            resValue("string", "app_name", "Teka")
            manifestPlaceholders["appLinkHost"] = "teka.cd"
        }
    }

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                // storeFile is resolved relative to this module (android/app),
                // so key.properties uses `storeFile=upload-keystore.jks`.
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            // MS7 — shrink, optimise and obfuscate the Java/Kotlin side.
            // Dart code is AOT-compiled into libapp.so and is unaffected;
            // `--obfuscate --split-debug-info` covers that half and is applied
            // by the release workflows, not here.
            //
            // `proguard-android-optimize.txt` is AGP's own baseline; our
            // additions live in proguard-rules.pro. Release builds are
            // validated end to end before shipping — R8 breaking a plugin is
            // the standard failure mode here, so this is never merged without
            // a real release build.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // Real upload key when key.properties is present (CI / a configured
            // dev machine); debug otherwise so `flutter run --release` and the
            // internal-testing APK builds still work without the keystore.
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    // Pairs with `isCoreLibraryDesugaringEnabled = true` above. The
    // 2.x line is the current desugar_jdk_libs branch — required by
    // flutter_local_notifications ≥ 14.
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

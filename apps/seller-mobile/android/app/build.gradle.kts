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
    namespace = "com.tootiye.tekaseller"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Required by flutter_local_notifications ≥ 14 — backports
        // newer java.time / java.util APIs to older Android API levels.
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.tootiye.tekaseller"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Flavors. `production` keeps the existing applicationId
    // (com.tootiye.tekaseller). `development` and `staging` get
    // suffixed ids so all three variants can install side-by-side. The
    // launcher label remains the public app name for every variant.
    // Firebase: google-services.json must contain client entries for
    // all three package names. See apps/buyer-mobile/android/app/build.gradle.kts
    // for the same comment in full.
    flavorDimensions += "env"
    productFlavors {
        create("development") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            resValue("string", "app_name", "Teka Vendeur Dev")
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            resValue("string", "app_name", "Teka Vendeur Stg")
        }
        create("production") {
            dimension = "env"
            resValue("string", "app_name", "Teka Vendeur")
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
    // Pairs with `isCoreLibraryDesugaringEnabled = true` above. Required
    // by flutter_local_notifications ≥ 14.
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // Generates Firebase resources from app/google-services.json at build
    // time. The version is pinned in android/settings.gradle.kts.
    id("com.google.gms.google-services")
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
    // side-by-side on the same device. app_name is generated as an
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
            resValue("string", "app_name", "Teka Dev")
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            resValue("string", "app_name", "Teka Staging")
        }
        create("production") {
            dimension = "env"
            // No applicationIdSuffix — production keeps com.tootiye.teka
            // to match the existing Play Store listing.
            resValue("string", "app_name", "Teka")
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
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

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
    // suffixed ids so all three variants can install side-by-side.
    // Firebase: google-services.json must contain client entries for
    // all three package names. See apps/buyer-mobile/android/app/build.gradle.kts
    // for the same comment in full.
    flavorDimensions += "env"
    productFlavors {
        create("development") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            resValue("string", "app_name", "Teka Seller Dev")
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            resValue("string", "app_name", "Teka Seller Staging")
        }
        create("production") {
            dimension = "env"
            resValue("string", "app_name", "Teka Seller")
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
    // Pairs with `isCoreLibraryDesugaringEnabled = true` above. Required
    // by flutter_local_notifications ≥ 14.
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

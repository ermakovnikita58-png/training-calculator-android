plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val uploadStorePath = System.getenv("FORGE_KEYSTORE_FILE") ?: ""
android {
    namespace = "ru.trainingcalculator.app"
    compileSdk = 36
    defaultConfig {
        applicationId = "ru.trainingcalculator.app" // KEEP for updates; choose a unique ID before first Google Play release.
        minSdk = 24
        targetSdk = 36
        versionCode = 14
        versionName = "11.1.0"
    }
    signingConfigs {
        if (uploadStorePath.isNotBlank()) {
            create("release") {
                storeFile = file(uploadStorePath)
                storePassword = System.getenv("FORGE_KEYSTORE_PASSWORD") ?: ""
                keyAlias = System.getenv("FORGE_KEY_ALIAS") ?: ""
                keyPassword = System.getenv("FORGE_KEY_PASSWORD") ?: ""
            }
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            if (uploadStorePath.isNotBlank()) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}
dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core-ktx:1.16.0")
}

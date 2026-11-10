plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp") version "2.3.10"
}

val crashConfigured = file("google-services.json").isFile
if (crashConfigured) {
    apply(plugin = "com.google.gms.google-services")
    apply(plugin = "com.google.firebase.crashlytics")
}
val posthogKey = System.getenv("FORGE_POSTHOG_PROJECT_KEY").orEmpty()
val posthogHost = System.getenv("FORGE_POSTHOG_HOST").orEmpty()
require(posthogKey.isEmpty() || posthogKey.matches(Regex("phc_[A-Za-z0-9]+"))) { "Use a PostHog project key" }
require(posthogKey.isEmpty() || posthogHost in setOf("https://us.i.posthog.com", "https://eu.i.posthog.com")) {
    "Configure a supported HTTPS PostHog ingest host"
}

val uploadStorePath = System.getenv("FORGE_KEYSTORE_FILE") ?: ""
android {
    namespace = "ru.trainingcalculator.app"
    compileSdk = 36
    buildFeatures { buildConfig = true }
    defaultConfig {
        applicationId = "ru.trainingcalculator.app" // Keep this ID for all updates.
        minSdk = 24
        targetSdk = 36
        buildConfigField("boolean", "FORGE_CRASH_CONFIGURED", crashConfigured.toString())
        buildConfigField("String", "FORGE_POSTHOG_KEY", "\"$posthogKey\"")
        buildConfigField("String", "FORGE_POSTHOG_HOST", "\"${if (posthogKey.isEmpty()) "" else posthogHost}\"")
        versionCode = 24
        versionName = "11.3.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
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
ksp { arg("room.schemaLocation", "$projectDir/schemas") }
dependencies {
    implementation(platform("com.google.firebase:firebase-bom:35.1.0"))
    implementation("com.google.firebase:firebase-crashlytics")
    implementation("androidx.work:work-runtime:2.11.0")
    testImplementation("junit:junit:4.13.2")
    implementation("androidx.camera:camera-camera2:1.6.2")
    implementation("androidx.camera:camera-lifecycle:1.6.2")
    implementation("androidx.camera:camera-view:1.6.2")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
    implementation("androidx.room:room-runtime:2.8.5")
    ksp("androidx.room:room-compiler:2.8.5")
    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core-ktx:1.16.0")
}

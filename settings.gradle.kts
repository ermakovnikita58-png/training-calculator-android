pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        if (providers.gradleProperty("forge.storeBuild").orNull == "true") {
            maven("https://nexus-external.rustore.ru/repository/maven-rustore-exposed") {
                content {
                    includeGroup("ru.rustore.sdk")
                    includeGroup("ru.ok.tracer")
                }
            }
        }
    }
}
rootProject.name = "ForgeTraining"
include(":app")

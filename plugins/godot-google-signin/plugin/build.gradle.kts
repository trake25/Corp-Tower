import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
	id("com.android.library")
	id("org.jetbrains.kotlin.android")
}

val pluginName = "GoogleSignInPlugin"
val pluginPackageName = "com.galaxxigames.tod.googlesignin"
val godotVersion = "4.6.2.stable"

android {
	namespace = pluginPackageName
	compileSdk = 35

	buildFeatures {
		buildConfig = true
	}

	defaultConfig {
		minSdk = 24
		manifestPlaceholders["godotPluginName"] = pluginName
		manifestPlaceholders["godotPluginPackageName"] = pluginPackageName
		buildConfigField("String", "GODOT_PLUGIN_NAME", "\"${pluginName}\"")
		setProperty("archivesBaseName", pluginName)
	}

	compileOptions {
		sourceCompatibility = JavaVersion.VERSION_17
		targetCompatibility = JavaVersion.VERSION_17
	}

	kotlin {
		compilerOptions {
			jvmTarget.set(JvmTarget.JVM_17)
		}
	}
}

dependencies {
	implementation("org.godotengine:godot:$godotVersion")
	implementation("androidx.credentials:credentials:1.5.0")
	implementation("androidx.credentials:credentials-play-services-auth:1.5.0")
	implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
	implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")
}

val addonBinDir = "../../../src/Client/App/corp-tower/addons/$pluginName/bin"

val copyDebugAAR by tasks.registering(Copy::class) {
	description = "Copies the debug AAR into the Godot project's addon"
	from("build/outputs/aar")
	include("$pluginName-debug.aar")
	into("$addonBinDir/debug")
}

val copyReleaseAAR by tasks.registering(Copy::class) {
	description = "Copies the release AAR into the Godot project's addon"
	from("build/outputs/aar")
	include("$pluginName-release.aar")
	into("$addonBinDir/release")
}

afterEvaluate {
	tasks.named("assembleDebug").configure {
		finalizedBy(copyDebugAAR)
	}

	tasks.named("assembleRelease").configure {
		finalizedBy(copyReleaseAAR)
	}
}

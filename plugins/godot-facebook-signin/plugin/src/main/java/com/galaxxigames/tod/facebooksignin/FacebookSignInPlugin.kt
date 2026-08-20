package com.galaxxigames.tod.facebooksignin

import android.content.Intent
import com.facebook.CallbackManager
import com.facebook.FacebookCallback
import com.facebook.FacebookException
import com.facebook.FacebookSdk
import com.facebook.login.LoginManager
import com.facebook.login.LoginResult
import org.godotengine.godot.Godot
import org.godotengine.godot.plugin.GodotPlugin
import org.godotengine.godot.plugin.SignalInfo
import org.godotengine.godot.plugin.UsedByGodot

class FacebookSignInPlugin(godot: Godot) : GodotPlugin(godot) {

	private val signInSuccessSignal = SignalInfo("sign_in_success", String::class.java)
	private val signInFailedSignal = SignalInfo("sign_in_failed", String::class.java, String::class.java)
	private var callbackManager: CallbackManager? = null
	private var configured = false

	override fun getPluginName() = BuildConfig.GODOT_PLUGIN_NAME

	override fun getPluginSignals(): Set<SignalInfo> = setOf(signInSuccessSignal, signInFailedSignal)

	@UsedByGodot
	fun configure(appId: String, clientToken: String): Boolean {
		if (appId.isBlank() || clientToken.isBlank()) {
			return false
		}
		val hostActivity = activity ?: return false

		FacebookSdk.setApplicationId(appId)
		FacebookSdk.setClientToken(clientToken)
		FacebookSdk.sdkInitialize(hostActivity.applicationContext)
		callbackManager = CallbackManager.Factory.create()
		configured = true
		return true
	}

	@UsedByGodot
	fun is_available(): Boolean = configured && activity != null && callbackManager != null

	@UsedByGodot
	fun sign_in() {
		val hostActivity = activity
		val manager = callbackManager

		if (hostActivity == null || manager == null || !configured) {
			emitSignal(signInFailedSignal.name, CODE_PROVIDER_UNAVAILABLE, "no configured host activity")
			return
		}

		LoginManager.getInstance().registerCallback(manager, object : FacebookCallback<LoginResult> {
			override fun onSuccess(result: LoginResult) {
				emitSignal(signInSuccessSignal.name, result.accessToken.token)
			}

			override fun onCancel() {
				emitSignal(signInFailedSignal.name, CODE_CANCELLED, "user cancelled sign-in")
			}

			override fun onError(error: FacebookException) {
				emitSignal(signInFailedSignal.name, CODE_ERROR, error.message ?: "Facebook sign-in failed")
			}
		})

		LoginManager.getInstance().logInWithReadPermissions(
			hostActivity,
			listOf("public_profile", "email")
		)
	}

	override fun onMainActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
		callbackManager?.onActivityResult(requestCode, resultCode, data)
	}

	companion object {
		const val CODE_PROVIDER_UNAVAILABLE = "provider_unavailable"
		const val CODE_CANCELLED = "cancelled"
		const val CODE_ERROR = "error"
	}
}

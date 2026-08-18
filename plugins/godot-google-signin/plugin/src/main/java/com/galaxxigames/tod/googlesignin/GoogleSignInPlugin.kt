package com.galaxxigames.tod.googlesignin

import android.content.Intent
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.auth.api.signin.GoogleSignInStatusCodes
import com.google.android.gms.common.api.ApiException
import org.godotengine.godot.Godot
import org.godotengine.godot.plugin.GodotPlugin
import org.godotengine.godot.plugin.SignalInfo
import org.godotengine.godot.plugin.UsedByGodot

class GoogleSignInPlugin(godot: Godot) : GodotPlugin(godot) {

	private val signInSuccessSignal = SignalInfo("sign_in_success", String::class.java)
	private val signInFailedSignal = SignalInfo("sign_in_failed", String::class.java, String::class.java)

	override fun getPluginName() = BuildConfig.GODOT_PLUGIN_NAME

	override fun getPluginSignals(): Set<SignalInfo> = setOf(signInSuccessSignal, signInFailedSignal)

	@UsedByGodot
	fun is_available(): Boolean = activity != null

	@UsedByGodot
	fun sign_in(serverClientId: String) {
		val hostActivity = activity

		if (hostActivity == null) {
			emitSignal(signInFailedSignal.name, CODE_PROVIDER_UNAVAILABLE, "no host activity")
			return
		}

		val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
			.requestIdToken(serverClientId)
			.requestEmail()
			.build()

		val client = GoogleSignIn.getClient(hostActivity, options)
		hostActivity.startActivityForResult(client.signInIntent, RC_SIGN_IN)
	}

	override fun onMainActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
		if (requestCode != RC_SIGN_IN) {
			return
		}

		try {
			val account = GoogleSignIn.getSignedInAccountFromIntent(data).getResult(ApiException::class.java)
			val idToken = account.idToken

			if (idToken == null) {
				emitSignal(signInFailedSignal.name, CODE_ERROR, "no id token in account")
				return
			}

			emitSignal(signInSuccessSignal.name, idToken)
		} catch (e: ApiException) {
			val statusName = GoogleSignInStatusCodes.getStatusCodeString(e.statusCode)
			val code = if (e.statusCode == GoogleSignInStatusCodes.SIGN_IN_CANCELLED) CODE_CANCELLED else CODE_ERROR
			emitSignal(
				signInFailedSignal.name,
				code,
				"statusCode=${e.statusCode} (${statusName}) message=${e.message}"
			)
		}
	}

	companion object {
		private const val RC_SIGN_IN = 9001
		const val CODE_PROVIDER_UNAVAILABLE = "provider_unavailable"
		const val CODE_CANCELLED = "cancelled"
		const val CODE_ERROR = "error"
	}
}

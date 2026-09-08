package com.galaxxigames.tod.googlesignin

import android.content.Intent
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
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
	private var freshSelectionGeneration = 0

	override fun getPluginName() = BuildConfig.GODOT_PLUGIN_NAME

	override fun getPluginSignals(): Set<SignalInfo> = setOf(signInSuccessSignal, signInFailedSignal)

	@UsedByGodot
	fun is_available(): Boolean = activity != null

	@UsedByGodot
	fun sign_in(serverClientId: String) {
		freshSelectionGeneration += 1
		val hostActivity = activity
		val client = createSignInClient(serverClientId)

		if (hostActivity == null || client == null) {
			emitSignal(signInFailedSignal.name, CODE_PROVIDER_UNAVAILABLE, "no host activity")
			return
		}

		hostActivity.startActivityForResult(client.signInIntent, RC_SIGN_IN)
	}

	@UsedByGodot
	fun sign_in_fresh(serverClientId: String) {
		val selectionGeneration = ++freshSelectionGeneration
		val hostActivity = activity
		val client = createSignInClient(serverClientId)

		if (hostActivity == null || client == null) {
			emitSignal(signInFailedSignal.name, CODE_PROVIDER_UNAVAILABLE, "no host activity")
			return
		}

		client.signOut().addOnCompleteListener { task ->
			if (selectionGeneration != freshSelectionGeneration) {
				return@addOnCompleteListener
			}

			if (!task.isSuccessful) {
				emitSignal(signInFailedSignal.name, CODE_ERROR, "could not clear previous Google sign-in")
				return@addOnCompleteListener
			}

			val currentActivity = activity
			if (currentActivity == null) {
				emitSignal(signInFailedSignal.name, CODE_PROVIDER_UNAVAILABLE, "no host activity")
				return@addOnCompleteListener
			}

			currentActivity.startActivityForResult(client.signInIntent, RC_SIGN_IN)
		}
	}

	@UsedByGodot
	fun reset_session(serverClientId: String): Boolean {
		freshSelectionGeneration += 1
		val client = createSignInClient(serverClientId) ?: return false
		client.signOut()
		return true
	}

	private fun createSignInClient(serverClientId: String): GoogleSignInClient? {
		val hostActivity = activity ?: return null
		if (serverClientId.isBlank()) {
			return null
		}

		val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
			.requestIdToken(serverClientId)
			.requestEmail()
			.build()

		return GoogleSignIn.getClient(hostActivity, options)
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

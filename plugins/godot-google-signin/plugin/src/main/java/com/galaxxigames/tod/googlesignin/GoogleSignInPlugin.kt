package com.galaxxigames.tod.googlesignin

import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.godotengine.godot.Godot
import org.godotengine.godot.plugin.GodotPlugin
import org.godotengine.godot.plugin.SignalInfo
import org.godotengine.godot.plugin.UsedByGodot

class GoogleSignInPlugin(godot: Godot) : GodotPlugin(godot) {

	private val pluginScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

	private val signInSuccessSignal = SignalInfo("sign_in_success", String::class.java)
	private val signInFailedSignal = SignalInfo("sign_in_failed", String::class.java, String::class.java)

	override fun getPluginName() = BuildConfig.GODOT_PLUGIN_NAME

	override fun getPluginSignals(): Set<SignalInfo> = setOf(signInSuccessSignal, signInFailedSignal)

	@UsedByGodot
	fun is_available(): Boolean = activity != null

	@UsedByGodot
	fun sign_in(serverClientId: String, hashedNonce: String) {
		val hostActivity = activity

		if (hostActivity == null) {
			emitSignal(signInFailedSignal.name, CODE_PROVIDER_UNAVAILABLE, "no host activity")
			return
		}

		val signInOption = GetSignInWithGoogleOption.Builder(serverClientId)
			.setNonce(hashedNonce)
			.build()

		val request = GetCredentialRequest.Builder()
			.addCredentialOption(signInOption)
			.build()

		val credentialManager = CredentialManager.create(hostActivity)

		pluginScope.launch {
			try {
				val result = credentialManager.getCredential(request = request, context = hostActivity)
				handleCredential(result)
			} catch (e: GetCredentialCancellationException) {
				emitSignal(signInFailedSignal.name, CODE_CANCELLED, describeException(e))
			} catch (e: NoCredentialException) {
				emitSignal(signInFailedSignal.name, CODE_NO_CREDENTIAL, describeException(e))
			} catch (e: GetCredentialProviderConfigurationException) {
				emitSignal(signInFailedSignal.name, CODE_PROVIDER_UNAVAILABLE, describeException(e))
			} catch (e: GetCredentialException) {
				emitSignal(signInFailedSignal.name, CODE_ERROR, describeException(e))
			}
		}
	}

	private fun describeException(e: Throwable): String {
		val parts = mutableListOf<String>()
		var current: Throwable? = e
		var depth = 0

		while (current != null && depth < 4) {
			parts.add("${current::class.java.name}: ${current.message}")
			current = current.cause
			depth++
		}

		return parts.joinToString(" <- caused by <- ")
	}

	private fun handleCredential(result: GetCredentialResponse) {
		val credential = result.credential

		if (credential !is CustomCredential ||
			credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
		) {
			emitSignal(signInFailedSignal.name, CODE_ERROR, "unexpected credential type")
			return
		}

		try {
			val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
			emitSignal(signInSuccessSignal.name, googleIdTokenCredential.idToken)
		} catch (e: GoogleIdTokenParsingException) {
			emitSignal(signInFailedSignal.name, CODE_ERROR, e.message ?: "")
		}
	}

	companion object {
		const val CODE_NO_CREDENTIAL = "no_credential"
		const val CODE_PROVIDER_UNAVAILABLE = "provider_unavailable"
		const val CODE_CANCELLED = "cancelled"
		const val CODE_ERROR = "error"
	}
}

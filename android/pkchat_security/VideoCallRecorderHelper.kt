package com.pkchat.security

import android.app.AlertDialog
import android.content.Context
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Environment
import android.util.Log
import android.webkit.JavascriptInterface
import android.widget.Toast
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Handles mutual-consent video + audio call recording for PK CHAT Android clients.
 *
 * Flow:
 * 1. Displays Tamil + English Recording Consent dialog ("வீடியோ பதிவு அனுமதி (Recording Consent)").
 * 2. Upon "Allow (அனுமதி)", initializes MediaRecorder (H.264 MP4 + AAC MIC audio)
 *    bound to a MediaProjection VirtualDisplay and saves to Movies/PKChat_Call_<timestamp>.mp4.
 * 3. Cleans up VirtualDisplay and MediaRecorder safely when stopped.
 */
class VideoCallRecorderHelper(private val context: Context) {

    private var mediaRecorder: MediaRecorder? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var isRecording = false
    private var videoFile: File? = null

    /**
     * 1. எதிரில் உள்ள நபரிடம் அனுமதி கேட்கும் பாப்-அப் (Recording Consent Dialog)
     */
    fun requestRemoteUserConsent(onConsentGranted: () -> Unit) {
        val builder = AlertDialog.Builder(context)
        builder.setTitle("வீடியோ பதிவு அனுமதி (Recording Consent)")
        builder.setMessage(
            "எதிரில் உள்ள நபர் இந்த வீடியோ காலைப் பதிவு செய்ய அனுமதிக்க கோருகிறார். நீங்கள் அனுமதிக்கிறீர்களா?\n\n" +
                "(The remote participant requests permission to record this video call.)"
        )

        // Allow (அனுமதி)
        builder.setPositiveButton("Allow (அனுமதி)") { _, _ ->
            Toast.makeText(context, "பதிவு செய்ய அனுமதி வழங்கப்பட்டது.", Toast.LENGTH_SHORT).show()
            onConsentGranted()
        }

        // Don't Allow (நிராகரி)
        builder.setNegativeButton("Don't Allow") { dialog, _ ->
            Toast.makeText(context, "பதிவு செய்ய அனுமதி மறுக்கப்பட்டது.", Toast.LENGTH_SHORT).show()
            dialog.dismiss()
        }

        val dialog = builder.create()
        dialog.setCancelable(false)
        dialog.show()
    }

    /**
     * 2. வீடியோ மற்றும் ஆடியோவைச் சேர்த்து ரெக்கார்ட் செய்யும் முறை
     */
    fun startVideoRecording(
        surfaceWidth: Int,
        surfaceHeight: Int,
        screenDensity: Int,
        mediaProjection: MediaProjection?
    ): Boolean {
        if (isRecording) return true

        val safeWidth = surfaceWidth.coerceAtLeast(360)
        val safeHeight = surfaceHeight.coerceAtLeast(640)
        val safeDensity = screenDensity.coerceAtLeast(160)

        return try {
            val formatTime = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
            val dir = context.getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: context.filesDir
            if (!dir.exists()) dir.mkdirs()
            videoFile = File(dir, "PKChat_Call_$formatTime.mp4")

            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }

            recorder.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setVideoSource(MediaRecorder.VideoSource.SURFACE)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setVideoEncoder(MediaRecorder.VideoEncoder.H264)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setVideoEncodingBitRate(1_500_000)
                setVideoFrameRate(30)
                setVideoSize(safeWidth, safeHeight)
                setOutputFile(videoFile?.absolutePath)
                prepare()
            }

            if (mediaProjection != null) {
                virtualDisplay = mediaProjection.createVirtualDisplay(
                    "PKChatCallRecorder",
                    safeWidth,
                    safeHeight,
                    safeDensity,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    recorder.surface,
                    null,
                    null
                )
            }

            recorder.start()
            mediaRecorder = recorder
            isRecording = true
            Toast.makeText(context, "வீடியோ கால் பதிவு தொடங்குகிறது...", Toast.LENGTH_SHORT).show()
            true
        } catch (e: IOException) {
            Log.e(TAG, "prepare() failed: ${e.message}")
            Toast.makeText(context, "ரெக்கார்டிங் தொடங்குவதில் பிழை: ${e.message}", Toast.LENGTH_SHORT).show()
            cleanupRecorderResources()
            false
        } catch (e: Exception) {
            Log.e(TAG, "startVideoRecording() failed: ${e.message}")
            Toast.makeText(context, "ரெக்கார்டிங் தொடங்குவதில் பிழை: ${e.message}", Toast.LENGTH_SHORT).show()
            cleanupRecorderResources()
            false
        }
    }

    /**
     * 3. ரெக்கார்டிங்கை நிறுத்துவது
     */
    @JavascriptInterface
    fun stopVideoRecording(): String? {
        if (!isRecording) return null
        val savedPath = videoFile?.absolutePath
        try {
            mediaRecorder?.stop()
            Toast.makeText(
                context,
                "வீடியோ பதிவு சேமிக்கப்பட்டது: $savedPath",
                Toast.LENGTH_LONG
            ).show()
        } catch (e: Exception) {
            Log.e(TAG, "stop() failed: ${e.message}")
        } finally {
            cleanupRecorderResources()
        }
        return savedPath
    }

    @JavascriptInterface
    fun isVideoRecording(): Boolean = isRecording

    private fun cleanupRecorderResources() {
        runCatching { virtualDisplay?.release() }
        virtualDisplay = null
        runCatching {
            mediaRecorder?.reset()
            mediaRecorder?.release()
        }
        mediaRecorder = null
        isRecording = false
    }

    companion object {
        private const val TAG = "VideoCallRecorderHelper"
    }
}

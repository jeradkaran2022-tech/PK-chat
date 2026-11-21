import 'package:flutter/material.dart';

class VoiceRecorderWidget extends StatefulWidget {
  const VoiceRecorderWidget({
    super.key,
    this.onDelete,
    this.onDownload,
    this.onSend,
    this.onSpeedChanged,
  });

  final VoidCallback? onDelete;
  final VoidCallback? onDownload;
  final VoidCallback? onSend;
  final ValueChanged<double>? onSpeedChanged;

  @override
  State<VoiceRecorderWidget> createState() => _VoiceRecorderWidgetState();
}

class _VoiceRecorderWidgetState extends State<VoiceRecorderWidget> {
  bool isRecording = false;
  bool hasRecordedAudio = false;
  bool isPlayingPreview = false;
  double playbackSpeed = 1.0;

  void _toggleRecord() {
    setState(() {
      isRecording = !isRecording;
      if (!isRecording) {
        hasRecordedAudio = true;
      }
    });
  }

  void _cycleSpeed() {
    setState(() {
      playbackSpeed = playbackSpeed == 1.0
          ? 1.5
          : (playbackSpeed == 1.5 ? 2.0 : 1.0);
    });
    widget.onSpeedChanged?.call(playbackSpeed);
  }

  void _deleteRecording() {
    setState(() {
      isRecording = false;
      hasRecordedAudio = false;
      isPlayingPreview = false;
    });
    widget.onDelete?.call();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Colors.blue.shade700, Colors.blue.shade400],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.blue.withValues(alpha: 0.3),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          // Delete Button
          IconButton(
            icon: const Icon(Icons.delete_outline, color: Colors.white70),
            tooltip: 'Delete Recording',
            onPressed: _deleteRecording,
          ),

          // Preview Play/Pause toggle when recorded
          if (hasRecordedAudio && !isRecording)
            IconButton(
              icon: Icon(
                isPlayingPreview ? Icons.pause_circle_filled : Icons.play_circle_fill,
                color: Colors.white,
              ),
              tooltip: isPlayingPreview ? 'Pause Preview' : 'Play Preview',
              onPressed: () => setState(() => isPlayingPreview = !isPlayingPreview),
            ),

          // ECG Style Waveform Area
          Expanded(
            child: SizedBox(
              height: 40,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: List.generate(
                  15,
                  (index) {
                    double barHeight = (index % 3 == 0)
                        ? 28.0
                        : ((index % 2 == 0) ? 18.0 : 10.0);
                    if (isRecording || isPlayingPreview) {
                      barHeight = (index % 2 == 0) ? 30.0 : 14.0;
                    }
                    return Container(
                      width: 3,
                      height: barHeight,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),

          // Playback Speed Toggle (1.0x / 1.5x / 2.0x)
          TextButton(
            onPressed: _cycleSpeed,
            child: Text(
              '${playbackSpeed}x',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),

          // Download Button
          IconButton(
            icon: const Icon(Icons.download, color: Colors.white),
            tooltip: 'Download Voice Note',
            onPressed: () {
              widget.onDownload?.call();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Voice note saved locally.'),
                ),
              );
            },
          ),

          if (hasRecordedAudio && !isRecording && widget.onSend != null)
            IconButton(
              icon: const Icon(Icons.send, color: Colors.white),
              tooltip: 'Send Voice Note',
              onPressed: () {
                widget.onSend?.call();
                _deleteRecording();
              },
            ),

          // Non-red Static Blue Record Button
          FloatingActionButton(
            heroTag: null,
            mini: true,
            backgroundColor: Colors.blue.shade800,
            elevation: 2,
            onPressed: _toggleRecord,
            child: Icon(
              isRecording ? Icons.stop : Icons.mic,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

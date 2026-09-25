# Clarifications

## Session 2026-09-25
- Q: Phase 00 dùng thư viện STT nào (plan ghi @react-native-voice/voice, bản 3.2.4 từ 2022, không hỗ trợ New Arch)? → A: expo-speech-recognition (57.x, khớp Expo SDK 57, có continuous + requiresOnDeviceRecognition)
- Q: Spike có ép nhận diện chạy trên thiết bị (NFR-02)? → A: Đo cả hai chế độ, on-device là lượt chính, network là đối chứng; app log khả năng hỗ trợ vi-VN on-device của máy
- Q: Phạm vi phiên implement Phase 00? → A: App spike + script tính WER/tỉ lệ mất chữ (có test) + REPORT.md khung kèm hướng dẫn đo; kết luận để trống đến khi có số đo thật trên máy thật

// Entry tuỳ biến thay `expo-router/entry`: widget màn hình chính (Android) chạy JS trong headless task,
// có thể lúc app chưa mở — handler phải được đăng ký ở entry (module tải cùng bundle), không ở một màn
// nào. Import được hoist nên `expo-router/entry` chạy trước dòng đăng ký; vô hại vì headless task chỉ
// được gọi sau khi bundle chạy xong.
import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widget/widget-task-handler';
import 'expo-router/entry';

if (Platform.OS === 'android') registerWidgetTaskHandler(widgetTaskHandler);

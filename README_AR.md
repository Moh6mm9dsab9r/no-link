# تطبيق Google WebView

تطبيق Android بسيط يفتح موقع Google داخل التطبيق باستخدام WebView.

## البناء التلقائي
عند رفع الملفات إلى فرع main يبدأ GitHub Actions في بناء نسخة Debug APK تلقائيًا.
بعد انتهاء العملية:
1. افتح تبويب Actions في المستودع.
2. اختر آخر عملية باسم Build Google WebView APK.
3. من قسم Artifacts نزّل Google-WebView-debug.
4. فك ضغط الملف وثبّت app-debug.apk على هاتف Android.

## المتطلبات
- Android 6.0 أو أحدث (API 23+).
- اتصال بالإنترنت.

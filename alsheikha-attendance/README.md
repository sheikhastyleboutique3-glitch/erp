# Al Sheikha Group — Attendance & Payroll Admin

هذا المستودع يحتوي على:

- **`admin.html`** — لوحة تحكم المدير (Executive Dashboard): إدارة الموظفين، حساب الرواتب، سجلات الحضور، الطلبات، إعدادات GPS، وصلاحيات الفريق (محاسب/سكرتير).
- **`index.html`** — بوابة الموظفين (Check-In/Check-Out + طلبات الإجازة/السلفة/الشهادات).
- **`firestore.rules`** — قواعد أمان Firestore، تحتاج نشرها من Firebase Console → Firestore Database → Rules.

## كيف تنسخ الملفات

1. افتح أي ملف من القائمة أعلاه.
2. دوس على زر **"Raw"** (يمين فوق محتوى الملف).
3. حدد الكل (Ctrl+A) وانسخ (Ctrl+C) — هذا يعطيك نسخة مطابقة 100% بدون أي تنسيق زائد من GitHub.
4. الصقه بملف محلي بنفس الاسم واحفظه.

## ملاحظات مهمة

- `admin.html` يحتاج مكتبات خارجية عبر CDN (html2canvas, jsPDF, SheetJS) — يعمل مباشرة بأي متصفح بدون تثبيت أي شيء.
- بعد نشر `firestore.rules`، أول شخص يسجل دخول بحساب Email/Password يصبح تلقائياً **Accountant** (صلاحية كاملة). يقدر يضيف حسابات أخرى كـ **Secretary** من تبويب Settings → Team Access.
- هذا المستودع **خاص بمشروع منفصل** عن `AL-SHEIKHA-GROUPE-` (المستودع الآخر بحسابك).

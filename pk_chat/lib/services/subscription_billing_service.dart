// ==========================================
// PK CHAT - VIP FOUNDER SUBSCRIPTION BYPASS
// (Strictly for Subscription Free Access ONLY)
// ==========================================

const List<String> vipFounderFreeAccessNumbers = [
  "0760852503", // முதல் பவுண்டேஷன் எண்
  "0712197111", // இரண்டாவது பவுண்டேஷன் எண்
  "0717860693", // மூன்றாவது பவுண்டேஷன் எண்
  "0753440226", // நான்காவது பவுண்டேஷன் எண் (Unlimited Free Subscription)
];

class SubscriptionBillingService {
  SubscriptionBillingService._();

  static const int standardFreeTrialDays = 30;
  static const int standardAnnualPriceUsd = 10;

  static String _digitsOnly(String phone) =>
      phone.replaceAll(RegExp(r'\D'), '');

  /// Checks whether [userPhoneNumber] belongs to one of the 3 VIP Founder
  /// numbers (supports local 07XXXXXXXX, +947XXXXXXXX, 947XXXXXXXX formats).
  /// Strictly grants Subscription Free Access ONLY.
  static bool isVipFounderFreeNumber(String? userPhoneNumber) {
    if (userPhoneNumber == null || userPhoneNumber.trim().isEmpty) {
      return false;
    }
    final digits = _digitsOnly(userPhoneNumber);
    if (digits.isEmpty) return false;

    for (final vipLocal in vipFounderFreeAccessNumbers) {
      final core9 = vipLocal.startsWith('0') ? vipLocal.substring(1) : vipLocal;
      if (digits == vipLocal ||
          digits == '94$core9' ||
          digits == '0094$core9' ||
          (digits.length >= 9 && digits.endsWith(core9))) {
        return true;
      }
    }
    return false;
  }

  /// சந்தா கட்டணச் சரிபார்ப்பு முறை (Subscription Check Logic)
  static bool verifyUserSubscriptionBilling(
    String userPhoneNumber,
    int trialDaysCompleted,
  ) {
    // இந்த மூன்று எண்களுக்கும் எத்தனை வருடங்கள் ஆனாலும் வாழ்நாள் முழுவதும் 100% இலவசம்
    if (vipFounderFreeAccessNumbers.contains(userPhoneNumber) ||
        isVipFounderFreeNumber(userPhoneNumber)) {
      return true; // Subscription fee bypassed completely
    }

    // மற்ற சாதாரண பயனர்களுக்கு 30 நாட்கள் இலவசம், பின்பு $10 வருடாந்திர கட்டணம்
    if (trialDaysCompleted <= standardFreeTrialDays) {
      return true;
    } else {
      return false; // Paid subscription required after trial
    }
  }

  static String describePlanStatus(
    String? userPhoneNumber, {
    int trialDaysCompleted = 0,
  }) {
    if (isVipFounderFreeNumber(userPhoneNumber)) {
      return 'VIP Founder · Lifetime 100% Free (Fee Bypassed)';
    }
    if (trialDaysCompleted <= standardFreeTrialDays) {
      final remaining = standardFreeTrialDays - trialDaysCompleted;
      return '30-Day Free Trial ($remaining days left) · Then \$10/year';
    }
    return 'Trial Ended · \$10/year Annual Subscription Required';
  }
}

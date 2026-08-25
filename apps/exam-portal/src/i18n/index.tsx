import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "hi";

// Same localStorage key apps/site's toggle uses, so a language choice made
// on the marketing site carries over when a user clicks into this portal
// (and vice versa) instead of resetting.
const STORAGE_KEY = "siteLang";

const translations = {
  en: {
    navHome: "Home", navJobs: "Jobs", navCurrentAffairs: "Current Affairs", navCalendar: "Exam Calendar", navEligibility: "Eligibility Checker",
    backToMainSite: "← Back to Main Site",
    footerRights: "All rights reserved.",

    orgSSC: "SSC", orgBanking: "Banking", orgRailway: "Railway", orgOtherHome: "Other Govt Jobs", orgOther: "Other",
    filterAll: "All",

    homeEyebrow: "🎓 SSC · Banking · Railway · Other Govt Jobs",
    homeTitle: "Government Jobs &", homeTitleHighlight: "Exam Updates",
    homeSubtitle: "Latest SSC, Banking, Railway, and other government vacancies, exam dates, and current affairs — all in one place.",
    checkEligibility: "Check My Eligibility",
    latestVacancies: "Latest Vacancies", viewAll: "View all",
    noVacanciesYet: "No vacancies published yet", noVacanciesYetDesc: "Check back soon for the latest government job openings.",
    todaysCurrentAffairs: "Today's Current Affairs", noCurrentAffairsYet: "No current affairs published yet",

    jobsTitle: "Government Jobs", jobsSubtitle: "Latest vacancies across SSC, Banking, Railway, and other government organizations.",
    noJobsFound: "No jobs found", tryDifferentCategory: "Try a different category, or check back later.",

    docAdmitCard: "Admit Card", docResult: "Result", docAnswerKey: "Answer Key", docNotification: "Notification", docSyllabus: "Syllabus",
    jobNotFound: "Job not found", jobNotFoundDesc: "This vacancy may have been removed or the link is incorrect.",
    infoOrganization: "Organization", infoTotalVacancies: "Total Vacancies", infoQualification: "Qualification", infoAgeLimit: "Age Limit",
    infoAgeYearsSuffix: "years", infoApplicationStart: "Application Start", infoApplicationEnd: "Application End", infoExamDate: "Exam Date",
    ageRelaxation: "Age Relaxation", ageRelaxationYearsSuffix: "years",
    documentsHeading: "Documents", officialNotification: "Official Notification", officialWebsite: "Official Website", applyNow: "Apply Now",
    infoDepartment: "Department", infoJobLocation: "Job Location", infoAdvertisementNumber: "Advertisement No.",
    keyHighlights: "Key Highlights", salaryHeading: "Salary & Benefits", vacancyBreakdown: "Vacancy Breakdown",
    selectionProcessHeading: "Selection Process", examPatternHeading: "Exam Pattern",
    examPatternMode: "Mode", examPatternDuration: "Duration", examPatternNegativeMarking: "Negative Marking",
    howToApplyHeading: "How to Apply", whoCanApplyHeading: "Who Can Apply", importantNoteHeading: "Important",

    currentAffairsTitle: "Current Affairs", currentAffairsSubtitle: "Daily updates relevant to SSC, Banking, Railway, and other competitive exams.",
    noCurrentAffairsFound: "No current affairs found",
    catNational: "National", catInternational: "International", catBanking: "Banking", catEconomy: "Economy", catScience: "Science",
    catTechnology: "Technology", catDefence: "Defence", catSports: "Sports", catAwards: "Awards", catAppointments: "Appointments",
    catGovtSchemes: "Govt. Schemes", catEnvironment: "Environment",

    notFound: "Not found", notFoundDesc: "This article may have been removed or the link is incorrect.",
    whatHappened: "What happened?", keyFacts: "Key Facts", whyImportant: "Why is it important?", examRelevance: "Exam Relevance",

    calendarTitle: "Exam Calendar", calendarSubtitle: "Upcoming application deadlines and exam dates, across all published recruitments.",
    noUpcomingDates: "No upcoming dates", noUpcomingDatesDesc: "No recruitments have application or exam dates yet.",
    applicationCloses: "Application closes", examDateLabel: "Exam date",

    eligibilityTitle: "Check My Eligibility",
    eligibilitySubtitle: "Enter your details to see which published vacancies you're eligible for based on age and category relaxation. This is a rule-based check against published recruitments, not a guarantee of selection — always confirm against the official notification.",
    fieldAge: "Age *", fieldQualification: "Qualification", fieldCategory: "Category",
    placeholderAge: "e.g. 23", placeholderQualification: "e.g. Graduate / B.Com", placeholderCategory: "e.g. general, obc, sc_st (for age relaxation)",
    checkingButton: "Checking...", checkEligibilityButton: "Check Eligibility",
    eligibleForCountTemplate: "You may be eligible for {n} {noun}", vacancySingular: "vacancy", vacancyPlural: "vacancies",
    noMatchesFound: "No matches found",
    noEligibleVacancies: "No eligible vacancies right now",
    noEligibleVacanciesDesc: "Try adjusting your details, or check back as new vacancies are published.",

    vacanciesSuffix: "vacancies", lastDate: "Last date",
  },
  hi: {
    navHome: "होम", navJobs: "नौकरियां", navCurrentAffairs: "करेंट अफेयर्स", navCalendar: "परीक्षा कैलेंडर", navEligibility: "पात्रता जांच",
    backToMainSite: "← मुख्य साइट पर वापस जाएं",
    footerRights: "सर्वाधिकार सुरक्षित।",

    orgSSC: "एसएससी", orgBanking: "बैंकिंग", orgRailway: "रेलवे", orgOtherHome: "अन्य सरकारी नौकरियां", orgOther: "अन्य",
    filterAll: "सभी",

    homeEyebrow: "🎓 एसएससी · बैंकिंग · रेलवे · अन्य सरकारी नौकरियां",
    homeTitle: "सरकारी नौकरियां और", homeTitleHighlight: "परीक्षा अपडेट",
    homeSubtitle: "नवीनतम एसएससी, बैंकिंग, रेलवे और अन्य सरकारी रिक्तियां, परीक्षा तिथियां और करेंट अफेयर्स — सब एक ही जगह।",
    checkEligibility: "मेरी पात्रता जांचें",
    latestVacancies: "नवीनतम रिक्तियां", viewAll: "सभी देखें",
    noVacanciesYet: "अभी तक कोई रिक्ति प्रकाशित नहीं हुई", noVacanciesYetDesc: "नवीनतम सरकारी नौकरी के अवसरों के लिए जल्द ही देखें।",
    todaysCurrentAffairs: "आज के करेंट अफेयर्स", noCurrentAffairsYet: "अभी तक कोई करेंट अफेयर्स प्रकाशित नहीं हुआ",

    jobsTitle: "सरकारी नौकरियां", jobsSubtitle: "एसएससी, बैंकिंग, रेलवे और अन्य सरकारी संगठनों में नवीनतम रिक्तियां।",
    noJobsFound: "कोई नौकरी नहीं मिली", tryDifferentCategory: "एक अलग श्रेणी आज़माएं, या बाद में देखें।",

    docAdmitCard: "एडमिट कार्ड", docResult: "परिणाम", docAnswerKey: "उत्तर कुंजी", docNotification: "अधिसूचना", docSyllabus: "पाठ्यक्रम",
    jobNotFound: "नौकरी नहीं मिली", jobNotFoundDesc: "यह रिक्ति हटाई जा चुकी है या लिंक गलत है।",
    infoOrganization: "संगठन", infoTotalVacancies: "कुल रिक्तियां", infoQualification: "योग्यता", infoAgeLimit: "आयु सीमा",
    infoAgeYearsSuffix: "वर्ष", infoApplicationStart: "आवेदन प्रारंभ", infoApplicationEnd: "आवेदन समाप्ति", infoExamDate: "परीक्षा तिथि",
    ageRelaxation: "आयु में छूट", ageRelaxationYearsSuffix: "वर्ष",
    documentsHeading: "दस्तावेज़", officialNotification: "आधिकारिक अधिसूचना", officialWebsite: "आधिकारिक वेबसाइट", applyNow: "अभी आवेदन करें",
    infoDepartment: "विभाग", infoJobLocation: "कार्य स्थान", infoAdvertisementNumber: "विज्ञापन संख्या",
    keyHighlights: "मुख्य विशेषताएं", salaryHeading: "वेतन और लाभ", vacancyBreakdown: "पद विवरण",
    selectionProcessHeading: "चयन प्रक्रिया", examPatternHeading: "परीक्षा पैटर्न",
    examPatternMode: "मोड", examPatternDuration: "अवधि", examPatternNegativeMarking: "नकारात्मक अंकन",
    howToApplyHeading: "आवेदन कैसे करें", whoCanApplyHeading: "कौन आवेदन कर सकता है", importantNoteHeading: "महत्वपूर्ण",

    currentAffairsTitle: "करेंट अफेयर्स", currentAffairsSubtitle: "एसएससी, बैंकिंग, रेलवे और अन्य प्रतियोगी परीक्षाओं से संबंधित दैनिक अपडेट।",
    noCurrentAffairsFound: "कोई करेंट अफेयर्स नहीं मिला",
    catNational: "राष्ट्रीय", catInternational: "अंतरराष्ट्रीय", catBanking: "बैंकिंग", catEconomy: "अर्थव्यवस्था", catScience: "विज्ञान",
    catTechnology: "प्रौद्योगिकी", catDefence: "रक्षा", catSports: "खेल", catAwards: "पुरस्कार", catAppointments: "नियुक्तियां",
    catGovtSchemes: "सरकारी योजनाएं", catEnvironment: "पर्यावरण",

    notFound: "नहीं मिला", notFoundDesc: "यह लेख हटाया जा चुका है या लिंक गलत है।",
    whatHappened: "क्या हुआ?", keyFacts: "मुख्य तथ्य", whyImportant: "यह महत्वपूर्ण क्यों है?", examRelevance: "परीक्षा प्रासंगिकता",

    calendarTitle: "परीक्षा कैलेंडर", calendarSubtitle: "सभी प्रकाशित भर्तियों में आगामी आवेदन की अंतिम तिथियां और परीक्षा तिथियां।",
    noUpcomingDates: "कोई आगामी तिथि नहीं", noUpcomingDatesDesc: "किसी भी भर्ती में आवेदन या परीक्षा तिथि नहीं है।",
    applicationCloses: "आवेदन की अंतिम तिथि", examDateLabel: "परीक्षा तिथि",

    eligibilityTitle: "मेरी पात्रता जांचें",
    eligibilitySubtitle: "आयु और श्रेणी छूट के आधार पर आप किन प्रकाशित रिक्तियों के लिए पात्र हैं, यह देखने के लिए अपनी जानकारी दर्ज करें। यह प्रकाशित भर्तियों के विरुद्ध एक नियम-आधारित जांच है, चयन की गारंटी नहीं — हमेशा आधिकारिक अधिसूचना से पुष्टि करें।",
    fieldAge: "आयु *", fieldQualification: "योग्यता", fieldCategory: "श्रेणी",
    placeholderAge: "जैसे 23", placeholderQualification: "जैसे स्नातक / बी.कॉम", placeholderCategory: "जैसे general, obc, sc_st (आयु छूट के लिए)",
    checkingButton: "जांच हो रही है...", checkEligibilityButton: "पात्रता जांचें",
    eligibleForCountTemplate: "आप {n} {noun} के लिए पात्र हो सकते हैं", vacancySingular: "रिक्ति", vacancyPlural: "रिक्तियों",
    noMatchesFound: "कोई मेल नहीं मिला",
    noEligibleVacancies: "अभी कोई पात्र रिक्ति नहीं",
    noEligibleVacanciesDesc: "अपनी जानकारी समायोजित करने का प्रयास करें, या नई रिक्तियों के प्रकाशित होने पर वापस देखें।",

    vacanciesSuffix: "पद", lastDate: "अंतिम तिथि",
  },
} as const;

type TranslationKey = keyof typeof translations.en;

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "en" ? "en" : "hi";
  });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  function setLang(next: Lang) {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }

  function t(key: TranslationKey): string {
    return translations[lang][key] ?? translations.en[key] ?? key;
  }

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}

const CATEGORY_KEY: Record<string, TranslationKey> = {
  national: "catNational", international: "catInternational", banking: "catBanking", economy: "catEconomy",
  science: "catScience", technology: "catTechnology", defence: "catDefence", sports: "catSports",
  awards: "catAwards", appointments: "catAppointments", govt_schemes: "catGovtSchemes", environment: "catEnvironment",
};

/** Translates a GovCurrentAffairCategory enum value for display (falls back to a plain-text version for anything unmapped). */
export function currentAffairCategoryLabel(t: (key: TranslationKey) => string, category: string): string {
  const key = CATEGORY_KEY[category];
  return key ? t(key) : category.replace("_", " ");
}

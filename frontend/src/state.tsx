// App-wide parent state: language, the parent's profile and the language list. Saved in this browser only.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "./api";
import type { LanguageInfo, Lang } from "./api";
import { translate, type Key } from "./i18n";

export type Profile = { lang: Lang; childName: string; parentName: string; birthday: string };

const PROFILE_KEY = "kita.profile";
const FALLBACK_LANGUAGES: LanguageInfo[] = [
  { code: "en", label: "English", rtl: false },
  { code: "de", label: "Deutsch", rtl: false },
];

function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if ((p.lang === "en" || p.lang === "de") && typeof p.childName === "string") {
      return { lang: p.lang, childName: p.childName, parentName: p.parentName ?? "", birthday: p.birthday ?? "" };
    }
  } catch {
    /* corrupt or blocked storage: start fresh */
  }
  return null;
}

function storeProfile(profile: Profile | null) {
  try {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* ignore */
  }
}

const detectLang = (): Lang => (navigator.language?.toLowerCase().startsWith("de") ? "de" : "en");

type AppValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  languages: LanguageInfo[];
  profile: Profile | null;
  saveProfile: (profile: Profile) => void;
  clearProfile: () => void;
  t: (key: Key, vars?: Record<string, string>) => string;
  dir: "ltr" | "rtl";
};

const Ctx = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(loadProfile);
  const [lang, setLangState] = useState<Lang>(() => profile?.lang ?? detectLang());
  const [languages, setLanguages] = useState<LanguageInfo[]>(FALLBACK_LANGUAGES);

  useEffect(() => {
    api.languages().then((r) => r.languages.length && setLanguages(r.languages)).catch(() => {});
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    setProfile((p) => {
      if (!p) return p;
      const updated = { ...p, lang: next };
      storeProfile(updated);
      return updated;
    });
  }, []);

  const saveProfile = useCallback((next: Profile) => {
    setProfile(next);
    setLangState(next.lang);
    storeProfile(next);
  }, []);

  const clearProfile = useCallback(() => {
    setProfile(null);
    storeProfile(null);
    api.forgetFamilyId();
  }, []);

  const value = useMemo<AppValue>(
    () => ({
      lang,
      setLang,
      languages,
      profile,
      saveProfile,
      clearProfile,
      t: (key, vars) => translate(lang, key, vars),
      dir: languages.find((l) => l.code === lang)?.rtl ? "rtl" : "ltr",
    }),
    [lang, setLang, languages, profile, saveProfile, clearProfile],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useApp must be used inside <AppProvider>");
  return value;
}

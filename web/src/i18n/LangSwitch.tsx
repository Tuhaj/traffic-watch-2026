import { Flag } from "./Flags";
import { track } from "../track";
import { LANGS, useI18n } from "./index";

export function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t("lang.label")}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          className={l.code === lang ? "active" : ""}
          aria-pressed={l.code === lang}
          title={l.name}
          onClick={() => {
            if (l.code !== lang) track("lang", l.code);
            setLang(l.code);
          }}
        >
          <Flag lang={l.code} />
          <span>{l.label}</span>
        </button>
      ))}
    </div>
  );
}

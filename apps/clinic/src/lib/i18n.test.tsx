import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { initI18n, LocaleProvider, useLocale } from "./i18n";

const LocaleProbe = () => {
  const { locale, setLocale } = useLocale();
  const { t } = useLingui();
  return (
    <div>
      <span data-testid="message">
        <Trans>Settings</Trans>
      </span>
      <span data-testid="locale">{locale}</span>
      <button aria-label="switch" onClick={() => setLocale(locale === "en" ? "th" : "en")}>
        {t`Language: English`}
      </button>
    </div>
  );
};

let container: HTMLDivElement;
let root: Root;

const renderProbe = () => {
  act(() => {
    root.render(
      <LocaleProvider>
        <LocaleProbe />
      </LocaleProvider>,
    );
  });
};

const click = (element: Element) => {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
};

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = "";
  document.body.innerHTML = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("i18n", () => {
  it("renders the source locale (en) by default", () => {
    renderProbe();
    expect(container.querySelector("[data-testid='message']")?.textContent).toBe("Settings");
    expect(container.querySelector("[data-testid='locale']")?.textContent).toBe("en");
  });

  it("switches to Thai, persists the choice and updates <html lang>", async () => {
    renderProbe();
    click(container.querySelector("button[aria-label='switch']")!);

    // Switching waits for the Thai catalog chunk to load.
    await vi.waitFor(() => {
      expect(container.querySelector("[data-testid='message']")?.textContent).toBe("การตั้งค่า");
    });
    expect(container.querySelector("[data-testid='locale']")?.textContent).toBe("th");
    expect(window.localStorage.getItem("vet.locale")).toBe("th");
    expect(document.documentElement.lang).toBe("th");
  });

  it("restores a stored locale on the next mount", async () => {
    window.localStorage.setItem("vet.locale", "th");
    await initI18n();
    renderProbe();
    expect(container.querySelector("[data-testid='message']")?.textContent).toBe("การตั้งค่า");
  });
});

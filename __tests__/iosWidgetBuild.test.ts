/**
 * The iOS widget on every iPhone and iPad that can install LYSM (client report 2026-10-22: LYSM missing
 * from the widget gallery on TestFlight build 11). Build 11's own app file showed the widget was inside
 * the app and signed correctly, but it needed iOS 17.0 while the app runs from iOS 16.4, so on iOS 16 the
 * app installed and its widget never appeared. Guarded here, with the other things that would break it
 * on some phones only. Swift can't compile here, so the Swift checks are an early warning; the EAS
 * build's compiler is the final one.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';
import appConfig from '../app.config';
import widgetTarget from '../targets/widget/expo-target.config.js';

// Jest runs on Node, but this project's types are React Native's (no Node types).
declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('fs') as { readFileSync(file: string, encoding: 'utf8'): string };

const ROOT = `${__dirname}/..`;
const read = (file: string) => readFileSync(`${ROOT}/${file}`, 'utf8');

const context: ConfigContext = {
  projectRoot: ROOT,
  staticConfigPath: null,
  packageJsonPath: null,
  config: {},
};
const config: ExpoConfig = appConfig(context);
const widget = widgetTarget(config);
const swift = read('targets/widget/CircleMoodsWidget.swift');

describe('widget minimum iOS', () => {
  it("is the app's own minimum, so every iPhone that installs LYSM can add the widget", () => {
    // Expo declares the app's minimum on ExpoModulesCore; the app target and Podfile use the same
    // (build 11 shipped MinimumOSVersion 16.4 for the app).
    const podspec = read('node_modules/expo-modules-core/ExpoModulesCore.podspec');
    const platforms = podspec.slice(podspec.indexOf('s.platforms'));
    const appMinimum = platforms.match(/:ios\s*=>\s*'([\d.]+)'/)?.[1];
    expect(appMinimum).toMatch(/^\d+\.\d+/);
    expect(widget.deploymentTarget).toBe(appMinimum);
  });

  it('is read from Expo, never typed in (an Expo upgrade moves the app and widget together)', () => {
    expect(read('targets/widget/expo-target.config.js')).not.toMatch(/deploymentTarget:\s*['"`\d]/);
  });
});

describe('widget target', () => {
  it('is a WidgetKit extension named LYSM that shares the app\'s App Group', () => {
    expect(widget.type).toBe('widget');
    expect(widget.displayName).toBe('LYSM');
    expect(widget.entitlements?.['com.apple.security.application-groups']).toEqual(
      config.ios?.entitlements?.['com.apple.security.application-groups'],
    );
    expect(read('targets/widget/Info.plist')).toMatch(
      /<key>NSExtensionPointIdentifier<\/key>\s*<string>com\.apple\.widgetkit-extension<\/string>/,
    );
  });
});

describe('widget Swift on iOS 16', () => {
  // iOS 17+ WidgetKit/SwiftUI APIs; each must sit inside an `if #available(iOS 17…)` branch.
  const IOS17_ONLY = [
    /\bcontainerBackground\(/,
    /\bcontainerBackgroundRemovable\b/,
    /\bcontentMarginsDisabled\b/,
    /\bAppIntentConfiguration\b/,
    /\bAppIntentTimelineProvider\b/,
    /\bWidgetConfigurationIntent\b/,
    /\bshowsWidgetContainerBackground\b/,
    /\bwidgetContentMargins\b/,
    /\binvalidatableContent\b/,
    /\b(Button|Toggle)\(intent:/,
  ];

  /** The code outside comments and outside `if #available(iOS 17+, *) { … }` branches. */
  function outsideIos17Checks(source: string): string {
    const code = source.replace(/\/\/.*$/gm, '');
    const check = /if\s+#available\(iOS\s+(\d+)(?:\.\d+)*,\s*\*\)\s*\{/g;
    let kept = '';
    let from = 0;
    let match = check.exec(code);
    while (match) {
      if (Number(match[1]) >= 17) {
        kept += code.slice(from, match.index);
        let depth = 1;
        let i = check.lastIndex;
        while (depth > 0 && i < code.length) {
          if (code[i] === '{') depth += 1;
          if (code[i] === '}') depth -= 1;
          i += 1;
        }
        from = i;
        check.lastIndex = i;
      }
      match = check.exec(code);
    }
    return kept + code.slice(from);
  }
  const unguarded = (source: string) =>
    IOS17_ONLY.filter((api) => api.test(outsideIos17Checks(source))).map(String);

  it('finds an unguarded iOS 17 call (the check itself works)', () => {
    expect(unguarded('Text("x").containerBackground(.background, for: .widget)')).toEqual([
      String(IOS17_ONLY[0]),
    ]);
    expect(
      unguarded('if #available(iOS 17.0, *) { v.containerBackground(.background, for: .widget) } else { v }'),
    ).toEqual([]);
  });

  it.each(['CircleMoodsWidget.swift', 'index.swift'])('%s uses iOS 17 APIs only behind a check', (file) => {
    expect(unguarded(read(`targets/widget/${file}`))).toEqual([]);
  });

  it('still gives iOS 17+ its system background (required there)', () => {
    expect(swift).toMatch(/if #available\(iOS 17\.0, \*\) \{\s*containerBackground\(/);
    expect(swift).toMatch(/\.widgetBackground\(\)/);
  });
});

describe('widget profile photos', () => {
  // Photos are stored at full size; decoding one whole (~36 MB for 12 MP) is over iOS's widget limit.
  const avatars = swift.slice(swift.indexOf('enum Avatars'), swift.indexOf('// MARK: - Timeline'));

  it('are decoded straight to a small thumbnail, never at full size', () => {
    expect(avatars).toMatch(/URLSession\.shared\.download\(for:/);
    expect(avatars).toMatch(/CGImageSourceCreateThumbnailAtIndex\(/);
    expect(avatars).toMatch(/kCGImageSourceThumbnailMaxPixelSize:/);
    expect(avatars).not.toMatch(/UIImage\(data:/);
    expect(avatars).not.toMatch(/URLSession\.shared\.data\(for:/);
  });
});

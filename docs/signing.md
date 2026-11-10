# Signing the desktop app

Operating systems check where an app comes from before they run it. This page covers what users see today, how to get
past it, and how maintainers turn on real signing for macOS and Windows.

| | Unsigned / ad-hoc (today) | Signed with a developer certificate |
| --- | --- | --- |
| **macOS** | "Unidentified developer" prompt, approve once | Opens normally |
| **Windows** | SmartScreen "unrecognized app" screen, **Run anyway** | No warning once the certificate has reputation |
| **Linux** | Nothing to sign | |

## For users

### macOS

Open `macos-arm64-OpenRive.dmg`, drag **OpenRive** to Applications, then approve it once, either way:

- right-click the app → **Open** → **Open**, or
- try to open it, then **System Settings → Privacy & Security → Open Anyway**.

**"OpenRive is damaged" and no "Open Anyway" button** (installers up to 0.2.7, [issue #12](https://github.com/UpstandPlatform/OpenRive/issues/12)):
those builds shipped with a signature that did not cover the whole app, so Gatekeeper treats the downloaded file as
corrupt instead of merely unidentified. Remove the download quarantine flag once and it opens:

```bash
xattr -dr com.apple.quarantine /Applications/OpenRive.app
```

Newer builds seal the bundle (see below), so the normal prompt appears instead.

**In-app updates should not hit this.** The updater downloads the new version itself, not through a browser, so macOS
should not quarantine it, and Gatekeeper only checks quarantined downloads. The first install from a browser download is
the one that is checked. Please report it if an update ever shows the damaged-app message.

### Windows

When SmartScreen says "Windows protected your PC": **More info → Run anyway**. Unzip `win-x64-OpenRive-Setup.zip`
first; running it from inside the zip can fail.

## How the release is signed

The **Desktop** workflow ([`.github/workflows/desktop.yml`](../.github/workflows/desktop.yml)) picks a macOS mode on
every build:

| Mode | When | What happens |
| --- | --- | --- |
| `adhoc` | No Apple secrets in the repository (the default) | [`apps/desktop/scripts/sign-macos.ts`](../apps/desktop/scripts/sign-macos.ts) runs as Electrobun's `postWrap` hook and seals the whole `.app` that goes into the DMG with an ad-hoc signature (`codesign --force --deep --sign -`), then verifies it. |
| `developer-id` | All the secrets below are set | Electrobun signs with your Developer ID certificate (hardened runtime, entitlements from `electrobun.config.ts`) and notarizes with Apple. |

Every macOS build then runs **Verify the macOS signature**, which mounts the produced DMG and runs
`codesign --verify --deep --strict` on the app inside it. A bundle that fails that check is exactly what macOS reports
as damaged, so the workflow fails instead of publishing it. In `developer-id` mode it also checks the update archive's
app and runs `spctl --assess`, the same check Gatekeeper makes.

The app inside the **update archive** is not sealed in `adhoc` mode. Electrobun rewrites its `version.json` after the
hook point that could sign it, so a seal made earlier would be invalid, which is worse than none. That app is installed by
the updater, never downloaded by a browser, so it is not quarantined and Gatekeeper does not assess it. Please report it
if a launch after an in-app update ever shows the damaged-app message.

Ad-hoc is a valid signature but has no identity, so macOS still asks users to approve the app once. Removing that
prompt needs a paid Apple Developer account.

## Turn on macOS Developer ID signing and notarization

You need an [Apple Developer Program](https://developer.apple.com/programs/) membership (99 USD a year).

1. **Create the certificate.** In Xcode → Settings → Accounts → Manage Certificates, or at developer.apple.com →
   Certificates, create a **Developer ID Application** certificate.
2. **Export it** from Keychain Access as a `.p12` (certificate and private key) with a password, then base64 encode it:

   ```bash
   base64 -i DeveloperID.p12 | pbcopy
   ```

3. **Note your identity and team.** The identity is the certificate's full name, for example
   `Developer ID Application: Your Name (ABCDE12345)` (`security find-identity -v -p codesigning` lists it). The team ID
   is the ten characters in brackets.
4. **Create an app-specific password** at [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security →
   App-Specific Passwords. Notarization uses it instead of your Apple ID password.
5. **Add repository secrets** (Settings → Secrets and variables → Actions):

   | Secret | Value |
   | --- | --- |
   | `MACOS_CERTIFICATE` | The base64 text of the `.p12` |
   | `MACOS_CERTIFICATE_PASSWORD` | The `.p12` password |
   | `MACOS_DEVELOPER_ID` | `Developer ID Application: Your Name (ABCDE12345)` |
   | `APPLE_TEAM_ID` | `ABCDE12345` |
   | `APPLE_ID` | The Apple ID e-mail of the developer account |
   | `APPLE_APP_PASSWORD` | The app-specific password |

6. **Run the Desktop workflow.** The "Import the Developer ID certificate" step reports `mode=developer-id`, notarization
   adds a few minutes to the macOS job, and the verification step ends with `spctl ... accepted`.

The workflow maps these secrets to the variables Electrobun reads: `ELECTROBUN_DEVELOPER_ID`, `ELECTROBUN_TEAMID`,
`ELECTROBUN_APPLEID` and `ELECTROBUN_APPLEIDPASS`. Those are the names Electrobun has used for signing, but they could
not be confirmed against Electrobun 2.x (the Hutch toolchain) from a non-macOS machine, so treat the first signed run as
the test: if the build reports a missing identity or credentials, compare them with the signing page of the Electrobun
version in `apps/desktop/package.json` and adjust the `env:` block of **Build the desktop app**. Nothing is sent to Apple
unless all six secrets exist.

Keep the secrets in the repository, never in files. Fork pull requests do not receive them, so their builds always use
the ad-hoc seal.

## Windows

The Windows build is not signed yet and the workflow does not sign it, so SmartScreen warns on first launch. Signing is a
separate step on the Windows runner, after `electrobun build` and before the artifacts are uploaded:

- **Azure Trusted Signing** (about 10 USD a month, no hardware token, works from CI) with the
  [`azure/trusted-signing-action`](https://github.com/Azure/trusted-signing-action), or
- a **code signing certificate** (OV or EV) from a certificate authority, applied with `signtool sign /fd SHA256 /tr
  http://timestamp.digicert.com /td SHA256`. Since 2023 CAs issue these on hardware tokens or cloud HSMs, so prefer a
  provider with a CI-friendly API.

Sign the installer and the app executable, then regenerate whatever Electrobun derives from them (the update archive and
patches), the same reason macOS is sealed inside the build rather than after it. Reputation builds with downloads: an
OV certificate may still show SmartScreen for a while, an EV certificate or Azure Trusted Signing is trusted sooner.

## Checking a build yourself (macOS)

```bash
codesign -dv --verbose=2 /Applications/OpenRive.app
codesign --verify --deep --strict --verbose=2 /Applications/OpenRive.app
spctl --assess --type execute --verbose=2 /Applications/OpenRive.app   # Gatekeeper's verdict
```

A healthy ad-hoc build shows `Signature=adhoc` with `Info.plist` bound and `Sealed Resources` present. The broken builds
showed `Info.plist=not bound` and `Sealed Resources=none`. A Developer ID build also shows a `TeamIdentifier` and an
`Authority=Developer ID Application: ...` chain, and `spctl` answers `accepted`.

import { expect, it } from "vitest";

import { isProviderCredentialedHost, providerMediaTarget } from "./providerMedia";

it("maps Bitbucket repository files and downloads to the API", () => {
  expect(
    providerMediaTarget(
      "https://bitbucket.org/ndbusinessit/invoice-service/raw/dcc6c29c/docs/pr-assets/preview.png",
    ),
  ).toEqual({
    providerId: "bitbucket",
    fetchUrl:
      "https://api.bitbucket.org/2.0/repositories/ndbusinessit/invoice-service/src/dcc6c29c/docs/pr-assets/preview.png",
  });
  expect(
    providerMediaTarget(
      "https://bitbucket.org/ndbusinessit/onefor_apps_mono/downloads/marketplace-overview.png",
    ),
  ).toEqual({
    providerId: "bitbucket",
    fetchUrl:
      "https://api.bitbucket.org/2.0/repositories/ndbusinessit/onefor_apps_mono/downloads/marketplace-overview.png",
  });
});

it("maps GitHub attachments and repository files", () => {
  expect(providerMediaTarget("https://github.com/user-attachments/assets/0f3c-11aa")).toEqual({
    providerId: "github",
    fetchUrl: "https://github.com/user-attachments/assets/0f3c-11aa",
  });
  expect(
    providerMediaTarget("https://github.com/acme/app/blob/main/docs/shot.png?raw=true"),
  ).toEqual({
    providerId: "github",
    fetchUrl: "https://raw.githubusercontent.com/acme/app/main/docs/shot.png",
  });
});

it("leaves other images alone", () => {
  expect(providerMediaTarget("https://example.com/shot.png")).toBeNull();
  expect(providerMediaTarget("http://bitbucket.org/a/b/downloads/x.png")).toBeNull();
  expect(providerMediaTarget("https://bitbucket.org/a/b/pull-requests/1")).toBeNull();
  expect(providerMediaTarget("data:image/png;base64,AAAA")).toBeNull();
});

it("keeps the credential off signed object stores", () => {
  expect(isProviderCredentialedHost("bitbucket", "https://api.bitbucket.org/2.0/x")).toBe(true);
  expect(isProviderCredentialedHost("bitbucket", "https://bbuseruploads.s3.amazonaws.com/x")).toBe(
    false,
  );
  expect(isProviderCredentialedHost("github", "https://objects.githubusercontent.com/x")).toBe(
    false,
  );
});

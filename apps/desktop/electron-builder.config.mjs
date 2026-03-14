const DEFAULT_REPOSITORY = "ShpetimA/open-warden";

function resolvePublishConfig() {
  const rawRepository =
    process.env.OPEN_WARDEN_UPDATE_REPOSITORY?.trim() ||
    process.env.GITHUB_REPOSITORY?.trim() ||
    DEFAULT_REPOSITORY;
  const [owner, repo, ...rest] = rawRepository.split("/");

  if (!owner || !repo || rest.length > 0) {
    return undefined;
  }

  return {
    provider: "github",
    owner,
    repo,
    releaseType: "release",
  };
}

const publish = resolvePublishConfig();

export default {
  appId: "com.openwarden.desktop",
  productName: "OpenWarden",
  artifactName: "OpenWarden-${version}-${arch}.${ext}",
  directories: {
    output: "release",
  },
  files: ["dist/**/*", ".vite/build/**/*", "package.json"],
  asar: true,
  publish: publish ? [publish] : undefined,
  mac: {
    target: ["dmg", "zip"],
    icon: "build/icon.icns",
    category: "public.app-category.developer-tools",
  },
  linux: {
    target: ["AppImage"],
    icon: "build/icon.png",
    category: "Development",
  },
  win: {
    target: ["nsis"],
    icon: "build/icon.ico",
  },
};

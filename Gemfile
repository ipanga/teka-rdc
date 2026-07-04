# Ruby dependencies for the iOS release toolchain (Fastlane).
#
# Consumed only by the macOS CI jobs in .github/workflows/release-mobile-ipa.yml
# (and locally by the operator running `fastlane match` the first time) via
# `ruby/setup-ruby` with `bundler-cache: true`. Nothing else in this monorepo
# uses Ruby — the pnpm/Flutter toolchains are unaffected.
#
# Pinned to a major line for reproducibility; refresh the lock with
# `bundle update fastlane` when you intend to move it.
source "https://rubygems.org"

gem "fastlane", "~> 2.222"

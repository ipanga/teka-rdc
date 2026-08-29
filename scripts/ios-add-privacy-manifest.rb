#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Add `ios/Runner/PrivacyInfo.xcprivacy` to an app's Runner target so Apple
# actually ships it in the bundle. A privacy manifest sitting on disk but not
# referenced by the Xcode project is silently ignored — it must be a member of
# the Runner target's Resources build phase.
#
# Added 2026-08-29 for App Review rejection 5.1.2(i) (buyer-mobile): the App
# Store Connect privacy labels claimed the app tracks users; it does not. The
# manifest is the binary-side declaration (NSPrivacyTracking = false, empty
# NSPrivacyTrackingDomains) that backs the corrected labels.
#
# Idempotent: re-running detects the file reference already exists and no-ops.
# Same style + xcodeproj dependency as scripts/ios-flavorize.rb, which is the
# other one-time project-surgery script in this repo (neither runs in CI — the
# resulting project.pbxproj is committed).
#
# Usage:
#   ruby scripts/ios-add-privacy-manifest.rb apps/buyer-mobile
#   ruby scripts/ios-add-privacy-manifest.rb apps/seller-mobile

require 'xcodeproj'

app_dir = ARGV[0] or abort 'usage: ios-add-privacy-manifest.rb <app-dir>'

MANIFEST = 'PrivacyInfo.xcprivacy'

proj_path = File.join(app_dir, 'ios', 'Runner.xcodeproj')
abort "no Xcode project at #{proj_path}" unless Dir.exist?(proj_path)

manifest_path = File.join(app_dir, 'ios', 'Runner', MANIFEST)
abort "missing #{manifest_path} — write the manifest first" unless File.exist?(manifest_path)

project = Xcodeproj::Project.open(proj_path)
runner  = project.targets.find { |t| t.name == 'Runner' } or abort 'no Runner target'

# Already wired? (file ref present AND in the target's resources phase)
existing = project.files.find { |f| f.path&.end_with?(MANIFEST) }
if existing && runner.resources_build_phase.files_references.include?(existing)
  puts "#{app_dir}: #{MANIFEST} already in the Runner target — nothing to do"
  exit 0
end

# The `Runner` group maps to ios/Runner/, where the manifest lives.
group = project.main_group.find_subpath('Runner', false) or abort 'no Runner group'

ref = existing || group.new_reference(MANIFEST)
runner.resources_build_phase.add_file_reference(ref, true)

project.save
puts "#{app_dir}: added #{MANIFEST} to the Runner target's Resources phase"

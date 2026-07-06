#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Wire Flutter iOS flavors (development / staging / production) into an app's
# Runner.xcodeproj, mirroring the Android product flavors. Idempotent-ish: it
# expands the stock Debug/Release/Profile build configurations into the 9
# flavor variants, sets per-flavor bundle id + display name + entitlements,
# generates one shared scheme per flavor, and adds a build phase that selects
# the right GoogleService-Info.plist. Run once per app after checkout changes;
# re-running detects the flavor configs already exist and no-ops.
#
# Usage: ruby scripts/ios-flavorize.rb <app-dir> <base-bundle-id> <base-display-name>
#   ruby scripts/ios-flavorize.rb apps/buyer-mobile  com.tootiye.teka       "Teka"
#   ruby scripts/ios-flavorize.rb apps/seller-mobile com.tootiye.tekaseller "Teka Vendeur"
#
# Uses the `xcodeproj` gem that ships with CocoaPods (no extra install).

require 'xcodeproj'

app_dir   = ARGV[0] or abort 'usage: ios-flavorize.rb <app-dir> <base-bundle-id> <base-display-name>'
base_id   = ARGV[1] or abort 'missing base bundle id'
base_name = ARGV[2] or abort 'missing base display name'

FLAVORS = {
  'development' => { suffix: '.dev',     name: "#{base_name} Dev" },
  'staging'     => { suffix: '.staging', name: "#{base_name} Stg" },
  'production'  => { suffix: '',         name: base_name },
}.freeze
BASES = %w[Debug Release Profile].freeze

proj_path   = File.join(app_dir, 'ios', 'Runner.xcodeproj')
project     = Xcodeproj::Project.open(proj_path)
runner      = project.targets.find { |t| t.name == 'Runner' } or abort 'no Runner target'
tests       = project.targets.find { |t| t.name == 'RunnerTests' }

def deep_dup(hash)
  Marshal.load(Marshal.dump(hash))
end

# Expand a build-configuration list's Debug/Release/Profile into 9 flavor
# variants. `override` (optional) mutates each new config's build_settings.
def expand_list(project, list, override = nil)
  return :already if list.build_configurations.any? { |c| c.name.include?('-') }

  originals = BASES.map { |b| list.build_configurations.find { |c| c.name == b } }.compact
  return :skip if originals.empty?

  created = []
  originals.each do |src|
    FLAVORS.each_key do |flavor|
      cfg = project.new(Xcodeproj::Project::Object::XCBuildConfiguration)
      cfg.name = "#{src.name}-#{flavor}"
      cfg.build_settings = deep_dup(src.build_settings)
      cfg.base_configuration_reference = src.base_configuration_reference
      override&.call(cfg, src.name, flavor)
      created << cfg
    end
  end
  originals.each do |c|
    list.build_configurations.delete(c)
    c.remove_from_project
  end
  created.each { |c| list.build_configurations << c }
  :expanded
end

runner_override = lambda do |cfg, base, flavor|
  meta = FLAVORS[flavor]
  cfg.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = base_id + meta[:suffix]
  cfg.build_settings['PRODUCT_DISPLAY_NAME']      = meta[:name]
  # Only the production Release build ships to TestFlight/App Store → production
  # APNs entitlement. Everything else uses the development entitlement.
  cfg.build_settings['CODE_SIGN_ENTITLEMENTS'] =
    (base == 'Release' && flavor == 'production') ? 'Runner/Runner-Release.entitlements'
                                                  : 'Runner/Runner.entitlements'
end

puts "project-level: #{expand_list(project, project.build_configuration_list)}"
puts "Runner target: #{expand_list(project, runner.build_configuration_list, runner_override)}"
puts "RunnerTests:   #{tests ? expand_list(project, tests.build_configuration_list) : 'no target'}"

# Per-config Flutter xcconfig so each flavor build config pulls in the matching
# flavored Pods xcconfig (Pods-Runner.<config>.xcconfig) + Generated.xcconfig.
# Without this, the stock Flutter/Debug.xcconfig only #include?s the non-flavored
# Pods config, which pod install no longer guarantees. Repoints each config's
# baseConfigurationReference at its own self-contained xcconfig.
flutter_dir = File.join(app_dir, 'ios', 'Flutter')
sample_ref  = runner.build_configurations.first.base_configuration_reference
flutter_grp = sample_ref ? sample_ref.parent : project.main_group['Flutter']
runner.build_configurations.each do |cfg|
  xcname = "#{cfg.name}.xcconfig"
  pods   = "Pods-Runner.#{cfg.name.downcase}.xcconfig"
  File.write(File.join(flutter_dir, xcname), <<~CFG)
    #include? "Pods/Target Support Files/Pods-Runner/#{pods}"
    #include "Generated.xcconfig"
  CFG
  # Match the existing Flutter xcconfig refs, whose path carries the "Flutter/"
  # prefix in a path-less group (sourceTree "<group>" → resolves to ios/Flutter/).
  ref = flutter_grp.files.find { |f| f.display_name == xcname } ||
        flutter_grp.new_reference("Flutter/#{xcname}")
  cfg.base_configuration_reference = ref
end
puts "wrote #{runner.build_configurations.size} per-config Flutter xcconfigs"

# Firebase per-flavor selection build phase (idempotent by name). Runs after
# the app bundle is assembled; overwrites GoogleService-Info.plist with the
# flavor's plist if present, else keeps the fallback copied by Copy Bundle Resources.
phase_name = 'Select GoogleService-Info.plist'
unless runner.shell_script_build_phases.any? { |p| p.name == phase_name }
  phase = runner.new_shell_script_build_phase(phase_name)
  phase.shell_script = '"${SRCROOT}/../../../scripts/ios-select-firebase-plist.sh"'
  phase.show_env_vars_in_log = '0'
  puts 'added Firebase-select build phase'
else
  puts 'Firebase-select build phase already present'
end

project.save

# --- Schemes: one shared scheme per flavor, cloned from Runner.xcscheme ------
schemes_dir = File.join(proj_path, 'xcshareddata', 'xcschemes')
runner_scheme = File.join(schemes_dir, 'Runner.xcscheme')
if File.exist?(runner_scheme)
  template = File.read(runner_scheme)
  FLAVORS.each_key do |flavor|
    xml = template.dup
    xml.gsub!('buildConfiguration = "Debug"',   "buildConfiguration = \"Debug-#{flavor}\"")
    xml.gsub!('buildConfiguration = "Release"', "buildConfiguration = \"Release-#{flavor}\"")
    xml.gsub!('buildConfiguration = "Profile"', "buildConfiguration = \"Profile-#{flavor}\"")
    File.write(File.join(schemes_dir, "#{flavor}.xcscheme"), xml)
    puts "wrote scheme #{flavor}.xcscheme"
  end
  File.delete(runner_scheme)
  puts 'removed Runner.xcscheme'
else
  puts 'Runner.xcscheme already removed — leaving flavor schemes as-is'
end

puts "DONE #{app_dir}"

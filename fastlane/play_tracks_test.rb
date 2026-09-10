# Guards the Google Play release configuration.
#
# Three things here are unrecoverable if wrong, which is why they get a test
# when the rest of the Fastfile does not:
#
#   1. Publishing to the WRONG APP. Both apps ship from one Fastfile and one
#      shared service account, and both listings are live.
#   2. Publishing to PRODUCTION. Play has no "unrelease" — an automated push
#      reaches every existing user on auto-update.
#   3. Overwriting the STORE LISTING. `supply` uploads metadata, images,
#      screenshots and changelogs BY DEFAULT from fastlane/metadata/android.
#      That directory does not exist here, so an unpinned release would push
#      emptiness over two real, human-written, live listings.
#
# Run standalone — no fastlane, no network, no credentials:
#   ruby fastlane/play_tracks_test.rb
#
# Parses the Fastfile and the workflow as SOURCE rather than loading them:
# loading the Fastfile needs the whole fastlane DSL.

require "minitest/autorun"

FASTFILE = File.expand_path("Fastfile", __dir__)
REPO_ROOT = File.expand_path("..", __dir__)
AAB_WORKFLOW = File.join(REPO_ROOT, ".github/workflows/release-mobile-aab.yml")

# Pull `"buyer" => { ... package_id: "X" }` out of the Fastfile source.
def play_apps_table
  src = File.read(FASTFILE)
  table = src[/^APPS = \{.*?\n\}\.freeze/m]
  raise "APPS table not found in Fastfile" if table.nil?

  table.scan(/"(\w+)"\s*=>\s*\{(.*?)\n  \}/m).each_with_object({}) do |(name, body), acc|
    acc[name] = {
      app_dir:    body[/app_dir:\s*"([^"]+)"/, 1],
      package_id: body[/package_id:\s*"([^"]+)"/, 1],
    }
  end
end

# The `upload_play` lane body with COMMENTS STRIPPED.
#
# Asserting against raw text is worthless here: the comments in that lane name
# every flag, so a test could stay green after the real parameter was deleted.
# The TestFlight guard learned this the hard way — see UploadLaneFlagsTest.
def upload_play_lane
  src = File.read(FASTFILE)
  lane = src[/lane :upload_play do.*?\n  end/m]
  raise "upload_play lane not found in Fastfile" if lane.nil?

  lane.lines.reject { |l| l =~ /^\s*#/ }.join
end

class PlayPackageMappingTest < Minitest::Test
  def setup
    @apps = play_apps_table
  end

  def test_both_apps_declare_a_package_id
    assert_equal %w[buyer seller], @apps.keys.sort
    @apps.each do |name, cfg|
      refute_nil cfg[:package_id], "#{name} has no package_id in the APPS table"
      refute_empty cfg[:package_id].to_s.strip, "#{name}.package_id is blank"
    end
  end

  def test_the_two_apps_cannot_share_a_listing
    ids = @apps.values.map { |a| a[:package_id] }
    assert_equal ids.uniq.length, ids.length, "both apps point at the same Play listing"
  end

  # The strongest guard in this file: the Fastfile's package id must still be
  # the applicationId Gradle actually builds. A rename on the Gradle side would
  # otherwise leave the Fastfile publishing a bundle under the other app's
  # identity — or under an id that does not exist.
  def test_package_id_matches_the_real_gradle_application_id
    @apps.each do |name, cfg|
      gradle = File.join(REPO_ROOT, cfg[:app_dir], "android/app/build.gradle.kts")
      assert File.exist?(gradle), "#{gradle} is missing"

      declared = File.read(gradle)[/^\s*applicationId\s*=\s*"([^"]+)"/, 1]
      refute_nil declared, "no applicationId found in #{gradle}"
      assert_equal declared, cfg[:package_id],
                   "#{name}: Fastfile package_id #{cfg[:package_id].inspect} != " \
                   "Gradle applicationId #{declared.inspect}"
    end
  end

  # production keeps the bare applicationId (that is the live listing); the
  # dev/staging flavors add a suffix so they can install side by side. Only the
  # production flavor is ever built for Play, so the bare id is the right one.
  def test_only_dev_and_staging_carry_an_application_id_suffix
    @apps.each_value do |cfg|
      gradle = File.read(File.join(REPO_ROOT, cfg[:app_dir], "android/app/build.gradle.kts"))
      suffixes = gradle.scan(/applicationIdSuffix\s*=\s*"([^"]+)"/).flatten
      assert_equal %w[.dev .staging], suffixes.sort,
                   "unexpected applicationIdSuffix set — production must keep the bare id"
    end
  end
end

class PlayTrackSafetyTest < Minitest::Test
  def setup
    @src = File.read(FASTFILE)
    @lane = upload_play_lane
  end

  def test_the_default_track_is_internal
    assert_match(/DEFAULT_PLAY_TRACK\s*=\s*"internal"/, @src)
  end

  def test_production_is_not_an_allowed_track
    allowed = @src[/PLAY_TRACKS\s*=\s*%w\[([^\]]*)\]/, 1].to_s.split
    refute_empty allowed, "PLAY_TRACKS not found"
    refute_includes allowed, "production", "the production track must never be publishable from CI"
  end

  def test_production_is_refused_explicitly
    # Belt and braces: even if PLAY_TRACKS grew a production entry, the
    # resolver refuses it by name.
    resolver = @src[/def resolve_play_track.*?\n  end/m]
    refute_nil resolver, "resolve_play_track not found"
    code = resolver.lines.reject { |l| l =~ /^\s*#/ }.join
    assert_match(/if track == "production"/, code)
    assert_match(/UI\.user_error!/, code)
  end

  def test_the_lane_publishes_a_completed_release
    assert_match(/release_status:\s*"completed"/, @lane)
  end

  # VERIFIED against the installed fastlane (Supply::Options):
  #   upload_to_play_store's `track` DEFAULTS TO "production".
  # So omitting `track:` does not fall back to something harmless — it ships to
  # every user. It must always be passed, and always from the resolver that
  # refuses production.
  def test_the_track_is_always_passed_explicitly
    assert_match(/track:\s*track\b/, @lane)
    assert_match(/track\s*=\s*resolve_play_track/, @lane)
  end
end

# The four flags standing between a release and an overwritten store listing.
class PlaySupplyFlagsTest < Minitest::Test
  def setup
    @lane = upload_play_lane
  end

  %w[metadata images screenshots changelogs].each do |what|
    define_method("test_skips_uploading_#{what}") do
      assert_match(
        /skip_upload_#{what}:\s*true/, @lane,
        "skip_upload_#{what} must be pinned true — supply would otherwise " \
        "push local #{what} over the live Play listing"
      )
    end
  end
end

# The service-account key can publish to both live apps. It must never be
# written to disk, logged, or put in the job summary.
class PlayCredentialHandlingTest < Minitest::Test
  def setup
    @src = File.read(FASTFILE)
    @lane = upload_play_lane
    @loader = @src[/def load_play_json_key.*?\n  end/m].to_s.lines.reject { |l| l =~ /^\s*#/ }.join
    @workflow = File.read(AAB_WORKFLOW)
  end

  def test_the_key_is_passed_as_data_not_a_file_path
    assert_match(/json_key_data:\s*load_play_json_key/, @lane)
    refute_match(/json_key:\s/, @lane, "json_key: reads a path — keep the key out of the filesystem")
  end

  def test_the_loader_never_prints_the_key
    refute_match(/UI\.(message|success|important)\([^)]*decoded/, @loader)
    refute_match(/puts\b/, @loader)
    # The error path must describe the problem without echoing the value.
    refute_match(/#\{raw\}|#\{decoded\}/, @loader)
  end

  def test_the_summary_never_contains_the_key
    # Named identifiers only. A blanket /key/i match here would flag `#{key}`,
    # which is the app key (buyer|seller) and not a credential.
    summaries = @lane.scan(/summary\(.*?\)\n/m).join
    refute_match(/PLAY_JSON_B64/, summaries)
    refute_match(/load_play_json_key/, summaries)
    refute_match(/json_key/, summaries)
    refute_match(/ENV\[/, summaries)
  end

  def test_the_workflow_never_echoes_the_secret
    play_job = @workflow[/^  play:.*\z/m]
    refute_nil play_job, "play job not found in the AAB workflow"
    code = play_job.lines.reject { |l| l =~ /^\s*#/ }.join
    # Referenced as an env var only — never interpolated into a run: line.
    refute_match(/echo .*PLAY_JSON_B64/, code)
    refute_match(/\$\{\{\s*secrets\.PLAY_SERVICE_ACCOUNT_JSON_B64\s*\}\}[^\n]*(echo|>>)/, code)
  end
end

class PlayWorkflowGateTest < Minitest::Test
  def setup
    @workflow = File.read(AAB_WORKFLOW)
    @play_job = @workflow[/^  play:.*\z/m]
    raise "play job not found" if @play_job.nil?
  end

  def test_the_upload_is_behind_the_protected_environment
    # Without this a push to Play needs no human at all.
    assert_match(/^    environment:\s*android-play\s*$/, @play_job)
  end

  def test_the_upload_waits_for_the_build
    assert_match(/^    needs:\s*build\s*$/, @play_job)
  end

  def test_the_workflow_offers_no_production_track
    options = @workflow[/track:\n(?:.*\n)*?\s*options:\s*\[([^\]]*)\]/, 1].to_s
    refute_empty options, "track input options not found"
    refute_match(/production/, options)
    assert_match(/internal/, options)
  end

  def test_internal_is_the_default_track
    block = @workflow[/      track:\n(?:        .*\n)+/]
    assert_match(/default:\s*internal/, block.to_s)
  end
end

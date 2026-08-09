# Guards the app → TestFlight group mapping.
#
# Distributing a build to the wrong tester group is not something you can take
# back: the invite email is already sent and the binary is already on a device.
# So the mapping gets a test, even though the rest of the Fastfile does not.
#
# Run standalone — no fastlane, no network, no credentials:
#   ruby fastlane/testflight_groups_test.rb
#
# It parses the APPS table out of the Fastfile rather than loading it, because
# loading the Fastfile requires the whole fastlane DSL.

require "minitest/autorun"

FASTFILE = File.expand_path("Fastfile", __dir__)

# Pull `"buyer" => { ... group_env: "X", default_group: "Y" }` out of the source.
def apps_table
  src = File.read(FASTFILE)
  table = src[/^APPS = \{.*?\n\}\.freeze/m]
  raise "APPS table not found in Fastfile" if table.nil?

  table.scan(/"(\w+)"\s*=>\s*\{(.*?)\n  \}/m).each_with_object({}) do |(name, body), acc|
    acc[name] = {
      bundle_id:     body[/bundle_id:\s*"([^"]+)"/, 1],
      group_env:     body[/group_env:\s*"([^"]+)"/, 1],
      default_group: body[/default_group:\s*"([^"]+)"/, 1],
    }
  end
end

class TestFlightGroupMappingTest < Minitest::Test
  def setup
    @apps = apps_table
  end

  def test_both_apps_are_present
    assert_equal %w[buyer seller], @apps.keys.sort
  end

  def test_exact_group_names_confirmed_by_the_operator
    # These are the real internal groups in App Store Connect. If either is
    # renamed there, change it here (or set the repo variable) — a wrong name
    # makes the release fail loudly rather than distribute to nobody.
    assert_equal "Teka Buyer test team", @apps["buyer"][:default_group]
    assert_equal "Testers Teka RDC", @apps["seller"][:default_group]
  end

  def test_each_app_reads_its_own_env_var
    # The workflow passes BOTH variables every run and the Fastfile picks by
    # TEKA_APP, so this mapping is the only thing standing between the buyer
    # build and the seller's testers.
    assert_equal "TESTFLIGHT_BUYER_GROUP", @apps["buyer"][:group_env]
    assert_equal "TESTFLIGHT_SELLER_GROUP", @apps["seller"][:group_env]
  end

  def test_no_two_apps_share_a_group_or_an_env_var
    groups = @apps.values.map { |a| a[:default_group] }
    envs   = @apps.values.map { |a| a[:group_env] }
    bundles = @apps.values.map { |a| a[:bundle_id] }

    assert_equal groups.uniq.length, groups.length, "two apps share a tester group"
    assert_equal envs.uniq.length, envs.length, "two apps read the same variable"
    assert_equal bundles.uniq.length, bundles.length, "two apps share a bundle id"
  end

  def test_nothing_is_blank
    @apps.each do |name, cfg|
      cfg.each do |field, value|
        refute_nil value, "#{name}.#{field} is missing from the APPS table"
        refute_empty value.to_s.strip, "#{name}.#{field} is blank"
      end
    end
  end
end

class UploadLaneFlagsTest < Minitest::Test
  def setup
    @src = File.read(FASTFILE)
    @lane = @src[/lane :upload_testflight do.*?\n  end/m]
    raise "upload_testflight lane not found" if @lane.nil?
  end

  # The three flags that decide whether a tester ever sees the build. All three
  # were wrong (or absent) until 2026-08-09, which is why five releases in a row
  # uploaded successfully and reached nobody.
  def test_waits_for_processing
    # Fastlane never distributes when this is true — distribution requires
    # Apple to have finished processing.
    assert_match(/skip_waiting_for_build_processing:\s*false/, @lane)
  end

  def test_does_not_skip_the_distribute_step
    # `skip_submission: true` uploads the binary and skips distribution, so
    # `groups:` would be silently ignored.
    assert_match(/skip_submission:\s*false/, @lane)
  end

  def test_stays_internal
    # External distribution would require Apple's beta review, which we
    # deliberately do not submit for.
    assert_match(/distribute_external:\s*false/, @lane)
  end

  def test_passes_the_resolved_group
    assert_match(/groups:\s*\[group\]/, @lane)
  end
end

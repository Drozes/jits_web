require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'InstagramReels'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'MIT'
  s.author         = 'ELO RATED'
  s.homepage       = 'https://elorated.com'
  # iOS only, unlike `backup-exclusion`'s podspec which also declares tvOS.
  # The whole mechanism is `UIPasteboard` plus `UIApplication.open`, and
  # `UIPasteboard` does not exist on tvOS, so declaring that platform would
  # promise a build that cannot compile.
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://elorated.com' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end

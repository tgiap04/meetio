Pod::Spec.new do |s|
  s.name           = 'MlkitTranslate'
  s.version        = '0.1.0'
  s.summary        = 'On-device translation with Google ML Kit'
  s.description    = 'Local Expo module wrapping ML Kit Translate for Meetio.'
  s.author         = 'Meetio'
  s.homepage       = 'https://github.com/meetio'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/meetio/meetio.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'GoogleMLKit/Translate'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end

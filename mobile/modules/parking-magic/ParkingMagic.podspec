require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name           = "ParkingMagic"
  s.version        = package["version"]
  s.summary        = package["description"]
  s.description    = package["description"]
  s.license        = package["license"]
  s.author         = package["author"]
  s.homepage       = package["homepage"]
  s.platforms      = { :ios => "13.4" }
  s.source         = { :git => "" }
  s.source_files   = "ios/**/*.{h,m,mm,swift}"
  s.resources      = "ios/Resources/**/*"
  
  s.dependency "ExpoModulesCore"
end

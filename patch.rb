require 'xcodeproj'

project_path = 'ios/PokerApp/PokerApp.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Find the main app target
target = project.targets.find { |t| t.name == 'PokerApp' }

# Find the group
group = project.main_group.find_subpath('PokerApp', true)

# Create file reference
file_path = 'StoreManager.swift'
file_ref = group.files.find { |f| f.path == file_path }
if file_ref.nil?
  file_ref = group.new_file(file_path)
  
  # Add to compile sources
  target.source_build_phase.add_file_reference(file_ref)
  puts "Added #{file_path} to target #{target.name}"
else
  puts "#{file_path} already exists in project"
end

project.save

"""仅生成 Xcode 工程与共享 scheme；无需第三方依赖。编译仍需 macOS/Xcode。"""
from pathlib import Path
import hashlib

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT / 'XunrunHealthBridge.xcodeproj'
PROJECT.mkdir(exist_ok=True)
def ident(value):
    return hashlib.sha256(value.encode()).hexdigest()[:24].upper()
def q(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"') + '"'
objects = []
def add(name, isa, fields):
    key = ident(name)
    body = ' '.join(k + ' = ' + v + ';' for k, v in fields.items())
    objects.append(key + ' = { isa = ' + isa + '; ' + body + ' };')
    return key
def array(values):
    return '(' + ','.join(values) + (',' if values else '') + ')'

files, build_files = [], []
for file in sorted((ROOT / 'HealthBridge').iterdir()):
    if file.suffix not in ('.swift', '.plist', '.entitlements'):
        continue
    kind = 'sourcecode.swift' if file.suffix == '.swift' else 'text.plist.entitlements' if file.suffix == '.entitlements' else 'text.plist.xml'
    key = add('file-' + file.name, 'PBXFileReference', {'lastKnownFileType': kind, 'path': q(file.name), 'sourceTree': q('<group>')})
    files.append(key)
    if file.suffix == '.swift':
        build_files.append(add('build-' + file.name, 'PBXBuildFile', {'fileRef': key}))
product = add('product', 'PBXFileReference', {'explicitFileType': 'wrapper.application', 'includeInIndex': '0', 'path': q('HealthBridge.app'), 'sourceTree': 'BUILT_PRODUCTS_DIR'})
source_group = add('sources', 'PBXGroup', {'children': array(files), 'path': 'HealthBridge', 'sourceTree': q('<group>')})
product_group = add('products', 'PBXGroup', {'children': array([product]), 'name': 'Products', 'sourceTree': q('<group>')})
main_group = add('main', 'PBXGroup', {'children': array([source_group, product_group]), 'sourceTree': q('<group>')})
sources = add('sources-phase', 'PBXSourcesBuildPhase', {'buildActionMask': '2147483647', 'files': array(build_files), 'runOnlyForDeploymentPostprocessing': '0'})
frameworks = add('frameworks-phase', 'PBXFrameworksBuildPhase', {'buildActionMask': '2147483647', 'files': '()', 'runOnlyForDeploymentPostprocessing': '0'})
resources = add('resources-phase', 'PBXResourcesBuildPhase', {'buildActionMask': '2147483647', 'files': '()', 'runOnlyForDeploymentPostprocessing': '0'})
project_configs, target_configs = [], []
for name in ('Debug', 'Release'):
    project_settings = {'SDKROOT': 'iphoneos', 'IPHONEOS_DEPLOYMENT_TARGET': q('17.0'), 'CLANG_ENABLE_MODULES': 'YES', 'SWIFT_VERSION': q('5.0'), 'SWIFT_OPTIMIZATION_LEVEL': q('-Onone' if name == 'Debug' else '-O'), 'DEBUG_INFORMATION_FORMAT': q('dwarf' if name == 'Debug' else 'dwarf-with-dsym')}
    target_settings = {'PRODUCT_NAME': q('$(TARGET_NAME)'), 'PRODUCT_BUNDLE_IDENTIFIER': q('com.yutian.xunrun.healthbridge'), 'CODE_SIGN_STYLE': 'Automatic', 'CODE_SIGN_ENTITLEMENTS': q('HealthBridge/HealthBridge.entitlements'), 'INFOPLIST_FILE': q('HealthBridge/Info.plist'), 'GENERATE_INFOPLIST_FILE': 'NO', 'TARGETED_DEVICE_FAMILY': q('1'), 'SWIFT_EMIT_LOC_STRINGS': 'YES'}
    def settings(values):
        return '{' + ''.join(k + ' = ' + v + ';' for k, v in values.items()) + '}'
    project_configs.append(add('project-' + name, 'XCBuildConfiguration', {'buildSettings': settings(project_settings), 'name': name}))
    target_configs.append(add('target-' + name, 'XCBuildConfiguration', {'buildSettings': settings(target_settings), 'name': name}))
project_list = add('project-list', 'XCConfigurationList', {'buildConfigurations': array(project_configs), 'defaultConfigurationIsVisible': '0', 'defaultConfigurationName': 'Release'})
target_list = add('target-list', 'XCConfigurationList', {'buildConfigurations': array(target_configs), 'defaultConfigurationIsVisible': '0', 'defaultConfigurationName': 'Release'})
target = add('target', 'PBXNativeTarget', {'buildConfigurationList': target_list, 'buildPhases': array([sources, frameworks, resources]), 'buildRules': '()', 'dependencies': '()', 'name': 'HealthBridge', 'productName': 'HealthBridge', 'productReference': product, 'productType': q('com.apple.product-type.application')})
project = add('project', 'PBXProject', {'attributes': '{LastUpgradeCheck = 1500; TargetAttributes = {' + target + ' = {CreatedOnToolsVersion = "15.0"; SystemCapabilities = {com.apple.HealthKit = {enabled = 1;};};};};}', 'buildConfigurationList': project_list, 'compatibilityVersion': q('Xcode 14.0'), 'developmentRegion': q('zh-Hans'), 'hasScannedForEncodings': '0', 'knownRegions': array([q('en'), q('zh-Hans'), 'Base']), 'mainGroup': main_group, 'productRefGroup': product_group, 'projectDirPath': q(''), 'projectRoot': q(''), 'targets': array([target])})
(PROJECT / 'project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n' + '\n'.join(objects) + '\n}; rootObject = ' + project + '; }\n', encoding='utf-8')
scheme_dir = PROJECT / 'xcshareddata/xcschemes'
scheme_dir.mkdir(parents=True, exist_ok=True)
reference = f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="HealthBridge.app" BlueprintName="HealthBridge" ReferencedContainer="container:XunrunHealthBridge.xcodeproj"/>'
(scheme_dir / 'HealthBridge.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1500" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{reference}</BuildActionEntry></BuildActionEntries></BuildAction>
<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{reference}</BuildableProductRunnable></LaunchAction>
<ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{reference}</BuildableProductRunnable></ProfileAction>
<AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>''', encoding='utf-8')
print(str(PROJECT))

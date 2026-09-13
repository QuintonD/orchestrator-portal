// Pre-test Android boot failures only: retain code locations, never exception
// messages, arbitrary log text, addresses, registers or application content.
// Exact QPR2 lock-path conditions, not an inference from nearby native frames:
// https://android.googlesource.com/device/generic/goldfish/+/f3487b53aafe47000f08501243f5924526f1809a/hals/gralloc/mapper.cpp
// LOG_ALWAYS_FATAL_IF stringifies its condition; liblog supplies this fixed prefix:
// https://android.googlesource.com/platform/system/logging/+/58dac317ea08b8f275ebd01ce864acab2de30b93/liblog/logger_write.cpp
const mapperAbortCategories = new Map([
  ["Abort message: 'Assertion failed: m.magic != CbExternalMetadata::kMagicValue'", 'goldfish_mapper_metadata_magic_mismatch'],
  ["Abort message: 'Assertion failed: !rcEnc->hasYUVCache()'", 'goldfish_mapper_yuv_cache_unavailable'],
  ["Abort message: 'Assertion failed: !rcEnc->featureInfo()->hasReadColorBufferDma'", 'goldfish_mapper_readback_dma_unavailable'],
]);

export function bootCrashLocations(text) {
  const locations = { processes: [], signals: [], exceptions: [], javaFrames: [], nativeFrames: [], categories: [] };
  const add = (key, value, limit = 16) => { if (!locations[key].includes(value) && locations[key].length < limit) locations[key].push(value); };
  const input = String(text).slice(-262144);
  const processes = new Set(['system_server', 'surfaceflinger', 'zygote', 'zygote64', 'vold', 'netd', 'installd', 'com.android.systemui', 'com.android.settings']);
  for (const line of input.split(/\r?\n/u).slice(-400)) {
    if (line.length > 2048) continue;
    // Strip recognized logcat prefixes, then match complete code-location
    // payloads. A location mentioned inside an exception message is not a frame.
    const payload = line.replace(/^(?:\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s+\d+\s+\d+\s+)?[VDIWEF]\s+(?:AndroidRuntime|DEBUG|libc|crash_dump64|crash_dump32|system_server|Zygote|zygote64|Watchdog)\s*:\s?/u, '').trim();
    const mapperAbort = mapperAbortCategories.get(payload);
    if (mapperAbort) add('categories', mapperAbort);
    const process = payload.match(/^Process: ([a-z0-9._]+), PID: \d+$/u)?.[1]
      ?? payload.match(/^pid: \d+, tid: \d+, name: [A-Za-z0-9_ :.-]+ >>> ([a-z0-9._]+) <<<$/u)?.[1];
    if (processes.has(process)) add('processes', process);
    const signal = payload.match(/^signal ([1-9]\d?) \((SIG(?:ABRT|SEGV|ILL|BUS|FPE|TRAP))\)(?:,|$)/u);
    if (signal) add('signals', `${signal[1]}:${signal[2]}`);
    const exception = payload.match(/^(?:Caused by: )?((?:java|javax|android|com\.android)\.[A-Za-z0-9_.$]+(?:Exception|Error))(?::|$)/u)?.[1];
    if (exception && exception.length <= 180) add('exceptions', exception);
    const java = payload.match(/^at ((?:java|javax|android|com\.android)\.[A-Za-z0-9_.$]+)\(([A-Za-z0-9_$]+\.java:\d{1,6}|Native Method|Unknown Source)\)$/u);
    if (java && java[1].length <= 180) add('javaFrames', `${java[1]}(${java[2]})`, 24);
    const native = payload.match(/^#\d{1,3}\s+pc\s+[a-f0-9]+\s+\/(?:[A-Za-z0-9_.@+-]+\/)*([A-Za-z0-9_.+-]+\.so)(?:\s+\(([^\r\n]{1,240})\))?$/u);
    if (native) {
      const symbol = native[2]?.replace(/\)\s+\(BuildId: [a-f0-9]+$/u, '');
      const credibleSymbol = symbol?.length <= 180 && /^[A-Za-z_$~][A-Za-z0-9_:.$~]*(?:<[A-Za-z0-9_ :,.*&<>]+>)?(?:\([A-Za-z0-9_:.$~*&, <>()\[\]-]*\))?\+\d{1,10}$/u.test(symbol);
      // Arguments/template text may contain arbitrary words. Retain only the
      // qualified identifier prefix and numeric offset, even for valid frames.
      const identifier = credibleSymbol ? symbol.match(/^([A-Za-z_$~][A-Za-z0-9_:.$~]*)/u)[1] : undefined;
      const offset = credibleSymbol ? symbol.match(/\+(\d{1,10})$/u)[1] : undefined;
      add('nativeFrames', native[1] + (identifier ? `:${identifier}+${offset}` : ''), 24);
    }
    for (const [name, pattern] of [
      ['jni_contract_failure', /JNI DETECTED ERROR IN APPLICATION/u],
      ['native_check_failed', /(?:Abort message:| F )[^\r\n]*\bCheck failed:/u],
      ['uncaught_native_exception', /terminating with uncaught exception|termination with uncaught exception/u],
      ['memory_exhaustion', /OutOfMemoryError|std::bad_alloc|Cannot allocate memory/u],
      ['graphics_initialization_failure', /EGL_NOT_INITIALIZED|Failed to initialize (?:EGL|Vulkan)|VK_ERROR_INITIALIZATION_FAILED/u],
      ['system_server_watchdog', /WATCHDOG KILLING SYSTEM PROCESS/u],
    ]) if (pattern.test(line)) add('categories', name);
  }
  return locations;
}

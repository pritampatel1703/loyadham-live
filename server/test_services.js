// Quick module load test for all new services
try {
  const ObsService = require('./services/obs-service');
  console.log('OK obs-service.js');
} catch (e) { console.error('FAIL obs-service.js:', e.message); }

try {
  const DatavideoService = require('./services/datavideo-service');
  console.log('OK datavideo-service.js');
} catch (e) { console.error('FAIL datavideo-service.js:', e.message); }

try {
  const RolandService = require('./services/roland-service');
  console.log('OK roland-service.js');
} catch (e) { console.error('FAIL roland-service.js:', e.message); }

try {
  const TricasterService = require('./services/tricaster-service');
  console.log('OK tricaster-service.js');
} catch (e) { console.error('FAIL tricaster-service.js:', e.message); }

try {
  const PanasonicService = require('./services/panasonic-service');
  console.log('OK panasonic-service.js');
} catch (e) { console.error('FAIL panasonic-service.js:', e.message); }

try {
  const ForaService = require('./services/fora-service');
  console.log('OK fora-service.js');
} catch (e) { console.error('FAIL fora-service.js:', e.message); }

try {
  const LivestreamService = require('./services/livestream-service');
  console.log('OK livestream-service.js');
} catch (e) { console.error('FAIL livestream-service.js:', e.message); }

try {
  const OseeService = require('./services/osee-service');
  console.log('OK osee-service.js');
} catch (e) { console.error('FAIL osee-service.js:', e.message); }

try {
  require('./routes/switchers');
  console.log('OK routes/switchers.js');
} catch (e) { console.error('FAIL routes/switchers.js:', e.message); }

console.log('--- All modules tested ---');

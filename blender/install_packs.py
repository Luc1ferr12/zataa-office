# Ekstrak asset pack MakeHuman (CC0) ke folder data user MPFB
import sys, zipfile, glob, os
from bl_ext.user_default.mpfb.services import LocationService, AssetService
data_dir = LocationService.get_user_data()
print("DATA_DIR", data_dir)
for z in sorted(glob.glob(os.path.join(sys.argv[-1], "*_cc0.zip"))):
    with zipfile.ZipFile(z) as f:
        f.extractall(data_dir)
    print("installed", os.path.basename(z))
AssetService.update_all_asset_lists()

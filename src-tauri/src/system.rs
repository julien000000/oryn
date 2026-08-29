use nvml_wrapper::enum_wrappers::device::TemperatureSensor;
use nvml_wrapper::Nvml;
use serde::Serialize;
use sysinfo::{Disks, System};

#[derive(Debug, Serialize, Clone, Default)]
pub struct GpuStats {
    pub available: bool,
    pub name: String,
    pub usage_percent: f32,
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    pub temperature_celsius: Option<u32>,
}

/// Lit les vraies statistiques GPU via NVML (bibliothèque officielle NVIDIA,
/// fournie avec le pilote). Renvoie available=false si aucune carte NVIDIA
/// n'est détectée, plutôt que d'inventer des chiffres.
pub fn get_gpu_stats(nvml: Option<&Nvml>) -> GpuStats {
    let Some(nvml) = nvml else {
        return GpuStats::default();
    };
    let Ok(device) = nvml.device_by_index(0) else {
        return GpuStats::default();
    };

    let name = device.name().unwrap_or_default();
    let utilization = device.utilization_rates().ok();
    let memory = device.memory_info().ok();
    let temperature = device.temperature(TemperatureSensor::Gpu).ok();

    GpuStats {
        available: true,
        name,
        usage_percent: utilization.map(|u| u.gpu as f32).unwrap_or(0.0),
        memory_used_bytes: memory.as_ref().map(|m| m.used).unwrap_or(0),
        memory_total_bytes: memory.as_ref().map(|m| m.total).unwrap_or(0),
        temperature_celsius: temperature,
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct DiskStat {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct SystemStats {
    pub cpu_usage_percent: f32,
    pub cpu_brand: String,
    pub cpu_cores: usize,
    pub ram_used_bytes: u64,
    pub ram_total_bytes: u64,
    pub disks: Vec<DiskStat>,
    pub gpu: GpuStats,
}

/// Lit les vraies statistiques système via l'API Windows (sysinfo). Ne renvoie
/// jamais de valeur inventée : si une info n'est pas disponible, le champ reste
/// à zéro/vide plutôt que d'être simulé.
pub fn get_stats(sys: &mut System) -> SystemStats {
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_usage_percent = sys.global_cpu_usage();
    let cpu_brand = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_default();
    let cpu_cores = sys.cpus().len();

    let disks = Disks::new_with_refreshed_list();
    let disk_stats: Vec<DiskStat> = disks
        .iter()
        .map(|d| DiskStat {
            name: {
                let n = d.name().to_string_lossy().to_string();
                if n.is_empty() {
                    d.mount_point().to_string_lossy().to_string()
                } else {
                    n
                }
            },
            mount_point: d.mount_point().to_string_lossy().to_string(),
            total_bytes: d.total_space(),
            available_bytes: d.available_space(),
        })
        .collect();

    SystemStats {
        cpu_usage_percent,
        cpu_brand,
        cpu_cores,
        ram_used_bytes: sys.used_memory(),
        ram_total_bytes: sys.total_memory(),
        disks: disk_stats,
        gpu: GpuStats::default(),
    }
}

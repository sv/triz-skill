# Trusted synthetic model: export a snapshot without stepping it.
using Agents
include(joinpath(@__DIR__, "../../../scripts/export-julia-model.jl"))
model = StandardABM(NoSpaceAgent; warn_deprecation=false)
add_agent!(model)
agents = export_agents_snapshot(model; model_id="synthetic", profile_id="snapshot", allagents=Agents.allagents)
@assert length(agents["agent_types"]) == 1
@assert agents["agent_types"][1]["count"] == 1
write_triz_json(stdout, agents)
println()

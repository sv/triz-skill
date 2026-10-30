# Trusted synthetic models only. This test exports declarations without solving or stepping.
using ModelingToolkit
using ModelingToolkit: t_nounits as t, D_nounits as D
include(joinpath(@__DIR__, "../../../scripts/export-julia-model.jl"))
@variables x(t) observed_value(t)
@parameters gain
@named sys = ODESystem([D(x) ~ gain*x], t, [x], [gain]; observed=[observed_value ~ x])
@variables extra(t)
@parameters another
@named wrapped = ODESystem([D(extra) ~ another], t, [extra], [another]; systems=[sys])
mtk = export_modelingtoolkit(wrapped; model_id="synthetic", profile_id="nominal")
@assert mtk["subsystems"] == [Dict("path" => ["sys"])]
@assert length(mtk["unknowns"]) == 2
@assert length(mtk["parameters"]) == 2
@assert length(mtk["equations"]) == 2
@assert length(mtk["observed"]) == 1
@assert any(any(occursin("x", s) for s in eq["rhs_refs"]) for eq in mtk["equations"])
@assert any(any(occursin("gain", s) for s in eq["rhs_refs"]) for eq in mtk["equations"])
write_triz_json(stdout, Dict("mtk" => mtk, "escape_test" => "quote\" slash\\ newline\n ☃"))
println()

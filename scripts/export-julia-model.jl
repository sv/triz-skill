# Trusted Julia caller only: include this file, instantiate a model in the caller, then call
# export_modelingtoolkit or export_agents_snapshot. No source paths are loaded, no simulation
# is stepped, and no package installation or network access is performed.
import ModelingToolkit

const TRIZ_MTK_FORMAT = "triz-modelingtoolkit"
const TRIZ_AGENTS_FORMAT = "triz-agents-snapshot"

function triz_equation_record(eq, section::String, index::Int, diagnostics::Vector)
    function refs(expr, side)
        try
            return sort!(unique!(string.(ModelingToolkit.get_variables(expr))))
        catch
            push!(diagnostics, Dict("code" => "unresolved-symbolic-term", "section" => section,
                "index" => index, "message" => "Could not enumerate $(side) symbolic references."))
            return String[]
        end
    end
    Dict("lhs" => string(eq.lhs), "rhs" => string(eq.rhs),
        "lhs_refs" => refs(eq.lhs, "lhs"), "rhs_refs" => refs(eq.rhs, "rhs"))
end

"""Export public ModelingToolkit metadata as the versioned TRIZ interchange, not a universal format.
Pass a trusted, already-instantiated system. Simplification may have removed intermediate symbols;
no semantic inference, model loading, or solving is performed."""
function export_modelingtoolkit(sys; model_id::AbstractString, profile_id::AbstractString)
    isempty(model_id) && throw(ArgumentError("model_id is required"))
    isempty(profile_id) && throw(ArgumentError("profile_id is required"))
    diagnostics = Any[Dict("code" => "symbolic-coverage", "section" => "model", "index" => 0,
        "message" => "Metadata describes this instantiated system; eliminated intermediates, executable Julia, symbol ownership, operator semantics and empirical truth are not exported.")]
    # Public subsystem access gives containment only. Flat symbolic declarations are not
    # assigned to a subsystem by guessing from their names.
    subsystems = Any[]
    try
        queue = [(sys, String[])]
        seen = Set{Tuple}()
        cursor = 1
        while cursor <= length(queue)
            node, path = queue[cursor]; cursor += 1
            for child in ModelingToolkit.get_systems(node)
                childpath = [path; string(nameof(child))]
                length(childpath) <= 64 || error("subsystem depth exceeds 64")
                Tuple(childpath) in seen && error("duplicate subsystem path")
                push!(seen, Tuple(childpath))
                push!(subsystems, Dict("path" => childpath))
                length(subsystems) <= 2000 || error("subsystem count exceeds 2000")
                push!(queue, (child, childpath))
            end
        end
    catch
        empty!(subsystems)
        push!(diagnostics, Dict("code" => "unresolved-hierarchy", "section" => "model", "index" => 0,
            "message" => "Subsystem hierarchy could not be exported completely."))
    end
    unknowns = string.(ModelingToolkit.unknowns(sys))
    parameters = string.(ModelingToolkit.parameters(sys))
    equations = [triz_equation_record(eq, "equations", i, diagnostics) for (i,eq) in enumerate(ModelingToolkit.equations(sys))]
    observed = [triz_equation_record(eq, "observed", i, diagnostics) for (i,eq) in enumerate(ModelingToolkit.observed(sys))]
    Dict("format" => TRIZ_MTK_FORMAT, "version" => 1, "model_id" => String(model_id),
        "profile_id" => String(profile_id), "unknowns" => unknowns, "parameters" => parameters,
        "equations" => equations, "observed" => observed, "subsystems" => subsystems, "diagnostics" => diagnostics)
end

"""Summarize agent types and field names of an instantiated Agents.jl model. This is a snapshot
of present agent structure, not the initial population, behavior rules, or a runnable export.
The trusted caller supplies `allagents=Agents.allagents`; this file does not load Agents.jl."""
function export_agents_snapshot(model; model_id::AbstractString, profile_id::AbstractString, allagents::Function)
    isempty(model_id) && throw(ArgumentError("model_id is required"))
    isempty(profile_id) && throw(ArgumentError("profile_id is required"))
    types = Dict{String,Dict{String,Any}}()
    for agent in allagents(model)
        name = string(typeof(agent))
        item = get!(types, name) do
            Dict{String,Any}("name" => name, "count" => 0, "fields" => collect(string.(fieldnames(typeof(agent)))))
        end
        item["count"] += 1
    end
    Dict("format" => TRIZ_AGENTS_FORMAT, "version" => 1, "model_id" => String(model_id),
        "profile_id" => String(profile_id), "agent_types" => [types[k] for k in sort!(collect(keys(types)))],
        "diagnostics" => [Dict("code" => "snapshot-not-behavior", "section" => "model", "index" => 0,
            "message" => "Current agent types and field names only; step rules, scheduler, parameters and runtime values are not exported.")])
end

# Minimal JSON writer: only finite JSON data, no custom object serialization and no eval.
function write_triz_json(io::IO, value)
    if value === nothing
        print(io, "null")
    elseif value isa Bool
        print(io, value ? "true" : "false")
    elseif value isa Integer
        print(io, value)
    elseif value isa AbstractFloat
        isfinite(value) || throw(ArgumentError("Non-finite JSON number"))
        print(io, value)
    elseif value isa AbstractString
        isvalid(value) || throw(ArgumentError("Invalid UTF-8 JSON string"))
        print(io, '"')
        for b in codeunits(value)
            if b == 0x22; print(io, "\\\"")
            elseif b == 0x5c; print(io, "\\\\")
            elseif b < 0x20; print(io, "\\u", lpad(string(b, base=16), 4, '0'))
            else; write(io, b)
            end
        end
        print(io, '"')
    elseif value isa AbstractVector
        print(io, '[')
        for (i, v) in enumerate(value)
            i > 1 && print(io, ','); write_triz_json(io, v)
        end
        print(io, ']')
    elseif value isa AbstractDict
        all(k -> k isa AbstractString, keys(value)) || throw(ArgumentError("JSON keys must be strings"))
        print(io, '{')
        for (i, k) in enumerate(sort!(collect(keys(value))))
            i > 1 && print(io, ','); write_triz_json(io, k); print(io, ':'); write_triz_json(io, value[k])
        end
        print(io, '}')
    else
        throw(ArgumentError("Not JSON-compatible: $(typeof(value))"))
    end
end

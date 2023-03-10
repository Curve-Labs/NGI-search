// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.6;

import "@gnosis.pm/zodiac/contracts/core/Module.sol";
import "./Permissions.sol";
import "./IBadger.sol";

contract Roles is Module {
    address public multisend;
    IBadger public badger;

    mapping(uint256 => Role) internal badgeRoles;

    event SetMultisendAddress(address multisendAddress);
    event RolesModSetup(
        address indexed initiator,
        address indexed owner,
        address indexed avatar,
        address target
    );

    /// `setUpModules` has already been called
    error SetUpModulesAlreadyCalled();

    /// Arrays must be the same length
    error ArraysDifferentLength();

    /// Sender is not a member of the role
    error NoMembership();

    /// Sender is allowed to make this call, but the internal transaction failed
    error ModuleTransactionFailed();

    /// @param _owner Address of the owner
    /// @param _avatar Address of the avatar (e.g. a Gnosis Safe)
    /// @param _target Address of the contract that will call exec function
    constructor(
        address _owner,
        address _avatar,
        address _target,
        address _badger
    ) {
        bytes memory initParams = abi.encode(_owner, _avatar, _target, _badger);
        setUp(initParams);
    }

    function setUp(bytes memory initParams) public override initializer {
        (
            address _owner,
            address _avatar,
            address _target,
            address _badger
        ) = abi.decode(initParams, (address, address, address, address));
        __Ownable_init();

        avatar = _avatar;
        target = _target;
        badger = IBadger(_badger);

        transferOwnership(_owner);

        emit RolesModSetup(msg.sender, _owner, _avatar, _target);
    }

    /// @dev Set the address of the expected multisend library
    /// @notice Only callable by owner.
    /// @param _multisend address of the multisend library contract
    function setMultisend(address _multisend) external onlyOwner {
        multisend = _multisend;
        emit SetMultisendAddress(multisend);
    }

    /// @dev Allows all calls made to an address.
    /// @notice Only callable by owner.
    /// @param badgeId Role to set for
    /// @param targetAddress Address to be allowed
    /// @param options defines whether or not delegate calls and/or eth can be sent to the target address.
    function allowTarget(
        uint256 badgeId,
        address targetAddress,
        ExecutionOptions options
    ) external onlyOwner {
        Permissions.allowTarget(
            badgeRoles[badgeId],
            badgeId,
            targetAddress,
            options
        );
    }

    /// @dev Disallows all calls made to an address.
    /// @notice Only callable by owner.
    /// @param badgeId BadgieId to set for
    /// @param targetAddress Address to be disallowed
    function revokeTarget(uint256 badgeId, address targetAddress)
        external
        onlyOwner
    {
        Permissions.revokeTarget(badgeRoles[badgeId], badgeId, targetAddress);
    }

    /// @dev Scopes calls to an address, limited to specific function signatures, and per function scoping rules.
    /// @notice Only callable by owner.
    /// @param badgeId BadgieId to set for
    /// @param targetAddress Address to be scoped.
    function scopeTarget(uint256 badgeId, address targetAddress)
        external
        onlyOwner
    {
        Permissions.scopeTarget(badgeRoles[badgeId], badgeId, targetAddress);
    }

    /// @dev Allows a specific function signature on a scoped target.
    /// @notice Only callable by owner.
    /// @param badgeId BadgeId to set for
    /// @param targetAddress Scoped address on which a function signature should be allowed.
    /// @param functionSig Function signature to be allowed.
    /// @param options Defines whether or not delegate calls and/or eth can be sent to the function.
    function scopeAllowFunction(
        uint256 badgeId,
        address targetAddress,
        bytes4 functionSig,
        ExecutionOptions options
    ) external onlyOwner {
        Permissions.scopeAllowFunction(
            badgeRoles[badgeId],
            badgeId,
            targetAddress,
            functionSig,
            options
        );
    }

    /// @dev Disallows a specific function signature on a scoped target.
    /// @notice Only callable by owner.
    /// @param badgeId BadgeId to set for
    /// @param targetAddress Scoped address on which a function signature should be disallowed.
    /// @param functionSig Function signature to be disallowed.
    function scopeRevokeFunction(
        uint256 badgeId,
        address targetAddress,
        bytes4 functionSig
    ) external onlyOwner {
        Permissions.scopeRevokeFunction(
            badgeRoles[badgeId],
            badgeId,
            targetAddress,
            functionSig
        );
    }

    /// @dev Sets scoping rules for a function, on a scoped address.
    /// @notice Only callable by owner.
    /// @param badgeId BadgeId to set for.
    /// @param targetAddress Scoped address on which scoping rules for a function are to be set.
    /// @param functionSig Function signature to be scoped.
    /// @param isParamScoped false for un-scoped, true for scoped.
    /// @param paramType Static, Dynamic or Dynamic32, depending on the parameter type.
    /// @param paramComp Any, or EqualTo, GreaterThan, or LessThan, depending on comparison type.
    /// @param compValue The reference value used while comparing and authorizing.
    /// @param options Defines whether or not delegate calls and/or eth can be sent to the function.
    function scopeFunction(
        uint256 badgeId,
        address targetAddress,
        bytes4 functionSig,
        bool[] calldata isParamScoped,
        ParameterType[] calldata paramType,
        Comparison[] calldata paramComp,
        bytes[] memory compValue,
        ExecutionOptions options
    ) external onlyOwner {
        Permissions.scopeFunction(
            badgeRoles[badgeId],
            badgeId,
            targetAddress,
            functionSig,
            isParamScoped,
            paramType,
            paramComp,
            compValue,
            options
        );
    }

    /// @dev Sets whether or not delegate calls and/or eth can be sent to a function on a scoped target.
    /// @notice Only callable by owner.
    /// @notice Only in play when target is scoped.
    /// @param badgeId BadgeId to set for.
    /// @param targetAddress Scoped address on which the ExecutionOptions for a function are to be set.
    /// @param functionSig Function signature on which the ExecutionOptions are to be set.
    /// @param options Defines whether or not delegate calls and/or eth can be sent to the function.
    function scopeFunctionExecutionOptions(
        uint256 badgeId,
        address targetAddress,
        bytes4 functionSig,
        ExecutionOptions options
    ) external onlyOwner {
        Permissions.scopeFunctionExecutionOptions(
            badgeRoles[badgeId],
            badgeId,
            targetAddress,
            functionSig,
            options
        );
    }

    /// @dev Sets and enforces scoping rules, for a single parameter of a function, on a scoped target.
    /// @notice Only callable by owner.
    /// @param badgeId BadgeId to set for.
    /// @param targetAddress Scoped address on which functionSig lives.
    /// @param functionSig Function signature to be scoped.
    /// @param paramIndex The index of the parameter to scope.
    /// @param paramType Static, Dynamic or Dynamic32, depending on the parameter type.
    /// @param paramComp Any, or EqualTo, GreaterThan, or LessThan, depending on comparison type.
    /// @param compValue The reference value used while comparing and authorizing.
    function scopeParameter(
        uint256 badgeId,
        address targetAddress,
        bytes4 functionSig,
        uint256 paramIndex,
        ParameterType paramType,
        Comparison paramComp,
        bytes calldata compValue
    ) external onlyOwner {
        Permissions.scopeParameter(
            badgeRoles[badgeId],
            badgeId,
            targetAddress,
            functionSig,
            paramIndex,
            paramType,
            paramComp,
            compValue
        );
    }

    /// @dev Sets and enforces scoping rules, for a single parameter of a function, on a scoped target.
    /// @notice Only callable by owner.
    /// @notice Parameter will be scoped with comparison type OneOf.
    /// @param badgeId BadgeId to set for.
    /// @param targetAddress Scoped address on which functionSig lives.
    /// @param functionSig Function signature to be scoped.
    /// @param paramIndex The index of the parameter to scope.
    /// @param paramType Static, Dynamic or Dynamic32, depending on the parameter type.
    /// @param compValues The reference values used while comparing and authorizing.
    function scopeParameterAsOneOf(
        uint256 badgeId,
        address targetAddress,
        bytes4 functionSig,
        uint256 paramIndex,
        ParameterType paramType,
        bytes[] calldata compValues
    ) external onlyOwner {
        Permissions.scopeParameterAsOneOf(
            badgeRoles[badgeId],
            badgeId,
            targetAddress,
            functionSig,
            paramIndex,
            paramType,
            compValues
        );
    }

    /// @dev Un-scopes a single parameter of a function, on a scoped target.
    /// @notice Only callable by owner.
    /// @param badgeId BadgeId to set for.
    /// @param targetAddress Scoped address on which functionSig lives.
    /// @param functionSig Function signature to be scoped.
    /// @param paramIndex The index of the parameter to un-scope.
    function unscopeParameter(
        uint256 badgeId,
        address targetAddress,
        bytes4 functionSig,
        uint8 paramIndex
    ) external onlyOwner {
        Permissions.unscopeParameter(
            badgeRoles[badgeId],
            badgeId,
            targetAddress,
            functionSig,
            paramIndex
        );
    }

    /// @dev Passes a transaction to the modifier.
    /// @param to Destination address of module transaction
    /// @param value Ether value of module transaction
    /// @param data Data payload of module transaction
    /// @param operation Operation type of module transaction
    /// @notice Can only be called by enabled modules
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation,
        uint256 badgeId
    ) public returns (bool success) {
        Permissions.check(
            badgeRoles[badgeId],
            multisend,
            to,
            value,
            data,
            operation,
            badger,
            badgeId
        );

        return exec(to, value, data, operation);
    }

    /// @dev Passes a transaction to the modifier, expects return data.
    /// @param to Destination address of module transaction
    /// @param value Ether value of module transaction
    /// @param data Data payload of module transaction
    /// @param operation Operation type of module transaction
    /// @notice Can only be called by enabled modules
    function execTransactionFromModuleReturnData(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation,
        uint256 badgeId
    ) public returns (bool, bytes memory) {
        Permissions.check(
            badgeRoles[badgeId],
            multisend,
            to,
            value,
            data,
            operation,
            badger,
            badgeId
        );
        return execAndReturnData(to, value, data, operation);
    }

    function updateBadger(address newBadger) external onlyOwner {
        badger = IBadger(newBadger);
    }
}

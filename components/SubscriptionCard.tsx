import { colors } from '@/constants/theme'
import { formatCurrency, formatStatusLabel, formatSubscriptionDateTime } from '@/lib/utils'
import Ionicons from '@expo/vector-icons/Ionicons'
import clsx from 'clsx'
import React from 'react'
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native'

const SubscriptionCard = ({name, price, currency, icon, billing, color, category, 
    plan, renewalDate, expanded, onPress, paymentMethod, startDate, status,
    onEditPress, onDeletePress, isDeleting}: SubscriptionCardProps) => {

const fallback = "Not provided";

    return (
        <Pressable onPress={onPress} className={clsx('sub-card', 
            expanded ? 'bg-card-expanded' : 'bg-card')} style={!expanded && color ? { backgroundColor: color } : undefined} >
            <View className="sub-head">
                <View className="sub-main">
                    <Image source={icon} className="sub-icon"/>
                    <View className="sub-copy">
                        <Text numberOfLines={1} className="sub-title">
                            {name}
                        </Text>

                        <Text numberOfLines={1} ellipsizeMode="tail" 
                            className="sub-meta">
                                {category?.trim() || plan?.trim() || (renewalDate ? formatSubscriptionDateTime(renewalDate) : '')}
                            </Text>
                    </View>
                </View>
            

                <View className="sub-price-box">
                    <Text className="sub-price">{formatCurrency(price, currency)}</Text>
                    <Text className="sub-billing">{billing}</Text>
                </View>

            </View>

            {expanded && (
                <View className="sub-body">
                    <View className="sub-details">
                        <View className="sub-row">
                            <View className="sub-row-copy">
                                <Text className="sub-label">Payment</Text>
                                <Text className="sub-value" numberOfLines={1} ellipsizeMode="tail">
                                    {paymentMethod?.trim() || fallback}
                                </Text>
                            </View>
                        </View>

                        <View className="sub-row">
                            <View className="sub-row-copy">
                                <Text className="sub-label">Category</Text>
                                <Text className="sub-value" numberOfLines={1} ellipsizeMode="tail">
                                    {category?.trim() || plan?.trim() || fallback}
                                </Text>
                            </View>
                        </View>

                        <View className="sub-row">
                            <View className="sub-row-copy">
                                <Text className="sub-label">Started:</Text>
                                <Text className="sub-value" numberOfLines={1} ellipsizeMode="tail">
                                    {startDate ? formatSubscriptionDateTime(startDate) : fallback}
                                </Text>
                            </View>
                        </View>

                        <View className="sub-row">
                            <View className="sub-row-copy">
                                <Text className="sub-label">Renewal Date:</Text>
                                <Text className="sub-value" numberOfLines={1} ellipsizeMode="tail">
                                    {renewalDate ? formatSubscriptionDateTime(renewalDate) : fallback}
                                </Text>
                            </View>
                        </View>

                        <View className="sub-row">
                            <View className="sub-row-copy">
                                <Text className="sub-label">Status: </Text>
                                <Text className="sub-value" numberOfLines={1} ellipsizeMode="tail">
                                    {status ? formatStatusLabel(status) : fallback}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {(onEditPress || onDeletePress) && (
                        <View className="sub-actions">
                            {onEditPress && (
                                <Pressable
                                    className="sub-action"
                                    onPress={onEditPress}
                                    disabled={isDeleting}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Edit ${name}`}
                                >
                                    <Ionicons name="create-outline" size={16} color={colors.primary} />
                                    <Text className="sub-action-text">Edit</Text>
                                </Pressable>
                            )}

                            {onDeletePress && (
                                <Pressable
                                    className="sub-action sub-action-danger"
                                    onPress={onDeletePress}
                                    disabled={isDeleting}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Delete ${name}`}
                                >
                                    {isDeleting ? (
                                        <ActivityIndicator color={colors.destructive} />
                                    ) : (
                                        <>
                                            <Ionicons name="trash-outline" size={16} color={colors.destructive} />
                                            <Text className="sub-action-danger-text">Delete</Text>
                                        </>
                                    )}
                                </Pressable>
                            )}
                        </View>
                    )}
                </View>
            )}

        </Pressable>
    )
}

export default SubscriptionCard
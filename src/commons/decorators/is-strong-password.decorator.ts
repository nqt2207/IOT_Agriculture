import { IsString, Matches, MinLength } from "class-validator"

export function IsStrongPassword (){
    return function(object: object, propertyName: string){
        IsString()(object,propertyName)
        MinLength(12)(object,propertyName)
        Matches(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/,
            {
                message: 'Password must be at least 12 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.'
            }
        )(object,propertyName)
    }
}